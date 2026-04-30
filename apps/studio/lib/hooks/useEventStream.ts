/**
 * useEventStream — fetch-based SSE client for the SGRS governance event stream.
 *
 * Opens `GET /api/stream/:tenantId` and routes incoming typed SGRS events to
 * the provided handler callbacks. Uses `fetch()` instead of `EventSource` so we
 * can inspect the HTTP status before committing to a reconnect loop — a 503
 * ("NATS disabled") stops retrying, whereas network errors retry with backoff.
 *
 * Usage:
 * ```tsx
 * const { connected } = useEventStream(tenantId, {
 *   onScopeEvent:   (ev) => applyScopeEvent(ev),
 *   onFinalityEvent:(ev) => applyFinalityEvent(ev),
 *   onVetoEvent:    (ev) => handleVeto(ev),
 * });
 * ```
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SgrsEvent } from "@sgrs/client-ts";

// ─── Callbacks ────────────────────────────────────────────────────────────────

export interface StreamHandlers {
  /** Called for scope.created / scope.updated / scope.deleted events. */
  onScopeEvent?: (event: SgrsEvent) => void;
  /** Called for scope.finality.changed / near-final events. */
  onFinalityEvent?: (event: SgrsEvent) => void;
  /** Called for scope.veto.activated / scope.veto.lifted events. */
  onVetoEvent?: (event: SgrsEvent) => void;
  /** Called for scope.claim.added events. */
  onClaimEvent?: (event: SgrsEvent) => void;
  /** Called for scope.drift.detected events. */
  onDriftEvent?: (event: SgrsEvent) => void;
  /** Called for scope.contradiction.detected / scope.contradiction.resolved events. */
  onContradictionEvent?: (event: SgrsEvent) => void;
  /** Called for scope.risk.identified events. */
  onRiskEvent?: (event: SgrsEvent) => void;
  /** Called for scope.document.indexed events. */
  onDocumentEvent?: (event: SgrsEvent) => void;
  /** Called for scope.epoch.completed events. */
  onEpochEvent?: (event: SgrsEvent) => void;
  /**
   * Called for EVERY parsed event, regardless of type.
   * Use this to drive an activity / audit feed without duplicating routing logic.
   */
  onAnyEvent?: (event: SgrsEvent) => void;
}

export interface UseEventStreamResult {
  /** True once the stream is open and receiving events. */
  connected: boolean;
  /**
   * Set when the stream is disrupted. Null during normal operation.
   * The hook retries automatically — this is informational only.
   */
  error: string | null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/** Retry delay on transient errors. Capped to avoid hammering the server. */
const RETRY_DELAY_MS = 3_000;

export function useEventStream(
  tenantId: string,
  handlers: StreamHandlers,
  enabled = true,
): UseEventStreamResult {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep handlers current without re-triggering the fetch effect.
  // Updated synchronously on every render — safe because the SSE loop only
  // reads handlersRef inside async callbacks that fire after render.
  const handlersRef = useRef<StreamHandlers>(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef      = useRef<AbortController | null>(null);
  // Set true permanently once the server returns 503 (NATS disabled).
  const disabledRef   = useRef(false);

  /** Route a parsed event object to the appropriate handler. */
  const routeEvent = useCallback((raw: Record<string, unknown>) => {
    if (typeof raw.type !== "string") return;
    const event = raw as unknown as SgrsEvent;
    const h = handlersRef.current;

    switch (event.type) {
      case "scope.veto.activated":
      case "scope.veto.lifted":
        h.onVetoEvent?.(event); break;

      case "scope.finality.changed":
      case "scope.finality.near-final":
        h.onFinalityEvent?.(event); break;

      case "scope.created":
      case "scope.updated":
      case "scope.deleted":
        h.onScopeEvent?.(event); break;

      case "scope.claim.added":
        h.onClaimEvent?.(event); break;

      case "scope.drift.detected":
        h.onDriftEvent?.(event); break;

      case "scope.contradiction.detected":
      case "scope.contradiction.resolved":
        h.onContradictionEvent?.(event); break;

      case "scope.risk.identified":
        h.onRiskEvent?.(event); break;

      case "scope.document.indexed":
        h.onDocumentEvent?.(event); break;

      case "scope.epoch.completed":
        h.onEpochEvent?.(event); break;

      default: break; // forward-compatible — unknown types ignored
    }
    // Always fire the catch-all handler — drives the activity feed.
    h.onAnyEvent?.(event);
  }, []);

  const connect = useCallback(async () => {
    if (disabledRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(
        `/api/stream/${encodeURIComponent(tenantId)}`,
        {
          signal:  controller.signal,
          headers: { Accept: "text/event-stream" },
          // Prevent any intermediary from buffering
          cache:   "no-store",
        },
      );

      // ── 503 means NATS is not configured — stop retrying forever ───────────
      if (res.status === 503) {
        disabledRef.current = true;
        setConnected(false);
        setError(null); // disabled, not an error condition
        console.info("[sgrs][studio] SSE stream disabled (NATS_URL not set).");
        return;
      }

      if (!res.ok || !res.body) {
        throw new Error(`SSE handshake failed: HTTP ${res.status}`);
      }

      setConnected(true);
      setError(null);

      // ── Read the stream line-by-line ────────────────────────────────────────
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on newlines; keep the last (potentially incomplete) line
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue; // skip comments, blanks
          try {
            const raw = JSON.parse(line.slice(6)) as Record<string, unknown>;
            routeEvent(raw);
          } catch {
            // Malformed JSON — skip the message, keep the stream open
          }
        }
      }

      // Stream ended normally (server closed it) — retry
      setConnected(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // intentional teardown

      setConnected(false);
      setError("Stream disconnected — reconnecting…");
    }

    // ── Schedule retry (unless we were aborted or permanently disabled) ───────
    if (!controller.signal.aborted && !disabledRef.current) {
      retryTimerRef.current = setTimeout(
        () => void connect(),
        RETRY_DELAY_MS,
      );
    }
  }, [tenantId, routeEvent]);

  useEffect(() => {
    if (!enabled) return;

    void connect();

    return () => {
      // Abort the in-flight fetch and cancel any pending retry
      abortRef.current?.abort();
      abortRef.current = null;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setConnected(false);
    };
  }, [connect, enabled]);

  return { connected, error };
}

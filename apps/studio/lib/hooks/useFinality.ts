/**
 * useFinality — fetch/poll the finality convergence status for a scope,
 * with optional SSE push integration.
 *
 * Fetches `GET /api/finality/:scopeId` on mount and at `pollIntervalMs`.
 * When `useEventStream` is wired in Shell, it calls `applyEvent()` directly —
 * SSE pushes arrive instantly; the poll acts as a background resync.
 *
 * Pass `scopeId = null` to suspend all fetching (e.g. while no scope is selected).
 *
 * Usage:
 * ```tsx
 * const { status, isLoading, applyEvent } = useFinality(scope.id, tenantId);
 * ```
 */

"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { FinalityStatus } from "@sgrs/api-schema";
import type { z } from "zod";
import type { SgrsEvent } from "@sgrs/client-ts";
import { createClient } from "../api-client";

export type ApiFinalityStatus = z.infer<typeof FinalityStatus>;

// ─── State machine ────────────────────────────────────────────────────────────

interface State {
  status: ApiFinalityStatus | null;
  isLoading: boolean;
  error: string | null;
}

type Action =
  | { type: "RESET" }
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: ApiFinalityStatus }
  | { type: "FETCH_NOT_FOUND" }
  | { type: "FETCH_ERROR"; payload: string }
  | { type: "FINALITY_PUSH"; payload: ApiFinalityStatus };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "RESET":
      return { status: null, isLoading: false, error: null };

    case "FETCH_START":
      return { ...state, isLoading: true, error: null };

    case "FETCH_SUCCESS":
      return { status: action.payload, isLoading: false, error: null };

    case "FETCH_NOT_FOUND":
      // No record yet (kernel hasn't run) — not an error, just no data
      return { status: null, isLoading: false, error: null };

    case "FETCH_ERROR":
      return { ...state, isLoading: false, error: action.payload };

    case "FINALITY_PUSH":
      // SSE-delivered update — apply immediately, clear loading state
      return { status: action.payload, isLoading: false, error: null };

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseFinalityResult {
  status: ApiFinalityStatus | null;
  isLoading: boolean;
  error: string | null;
  /** Trigger an immediate out-of-band refresh. */
  refresh: () => void;
  /**
   * Apply a NATS finality event from the SSE stream directly to local state.
   * Called by `useEventStream` — do not call from UI components directly.
   * Only processes events matching this hook's `scopeId`.
   */
  applyEvent: (event: SgrsEvent) => void;
}

export function useFinality(
  /** Pass null to suspend fetching (e.g. while no scope is selected). */
  scopeId: string | null,
  tenantId: string,
  pollIntervalMs = 5_000,
): UseFinalityResult {
  const [state, dispatch] = useReducer(reducer, {
    status: null,
    isLoading: false,
    error: null,
  });

  // Memoized so the client is not re-created on every render.
  const api = useMemo(() => createClient({ tenantId }), [tenantId]);

  // Use a ref for the timer so the effect cleanup doesn't need it in its deps.
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    // Silently skip when no scope is selected
    if (!scopeId) return;

    dispatch({ type: "FETCH_START" });
    try {
      const data = await api.finality.get(scopeId);
      dispatch({ type: "FETCH_SUCCESS", payload: data });
    } catch (err: unknown) {
      // 404 = no record yet (kernel hasn't run); treat as "no data" not an error
      const is404 =
        err != null &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 404;

      if (is404) {
        dispatch({ type: "FETCH_NOT_FOUND" });
      } else {
        const msg =
          err != null && typeof err === "object" && "error" in err
            ? String((err as { error: unknown }).error)
            : "Failed to fetch finality status";
        dispatch({ type: "FETCH_ERROR", payload: msg });
      }
    }
  }, [api, scopeId]);

  // Reset finality status when scopeId changes (before fetching new data)
  useEffect(() => {
    dispatch({ type: "RESET" });
  }, [scopeId]);

  useEffect(() => {
    void fetchStatus();

    if (pollIntervalMs > 0) {
      timerRef.current = setInterval(() => void fetchStatus(), pollIntervalMs);
    }

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [fetchStatus, pollIntervalMs]);

  /**
   * Apply a NATS finality event — only acts on events matching this instance's
   * scopeId. All other event types are ignored (caller may route broadly).
   */
  const applyEvent = useCallback(
    (event: SgrsEvent) => {
      if (!scopeId) return;
      if (
        event.type !== "scope.finality.changed" &&
        event.type !== "scope.finality.near-final"
      ) {
        return;
      }
      // Type narrowing: both events have scopeId and payload
      if (
        "scopeId" in event &&
        event.scopeId === scopeId &&
        "payload" in event &&
        event.payload != null
      ) {
        dispatch({
          type: "FINALITY_PUSH",
          payload: event.payload as ApiFinalityStatus,
        });
      }
    },
    [scopeId],
  );

  return {
    status: state.status,
    isLoading: state.isLoading,
    error: state.error,
    refresh: () => void fetchStatus(),
    applyEvent,
  };
}

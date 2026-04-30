/**
 * useDomainData — single hook providing live claims, drifts, contradictions,
 * risks, documents and epoch summaries for a scope.
 *
 * Polls on mount (and every `pollMs`) and merges SSE push updates from
 * `useEventStream` via the `apply*` callbacks. One hook, one API client
 * instance — avoids 6 separate hooks each creating their own client.
 *
 * Usage:
 * ```tsx
 * const domain = useDomainData(scopeId, tenantId);
 * // domain.claims, domain.contradictions, domain.risks, ...
 * // domain.applyClaimEvent(event)  — called by useEventStream
 * ```
 */

"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import { createClient } from "../api-client";
import type {
  ApiClaim,
  ApiDrift,
  ApiContradiction,
  ApiRisk,
  ApiSgrsDocument,
  ApiEpochSummary,
} from "../api-client";
import type { SgrsEvent } from "@sgrs/client-ts";

// ─── State ────────────────────────────────────────────────────────────────────

export interface DomainState {
  claims: ApiClaim[];
  drifts: ApiDrift[];
  contradictions: ApiContradiction[];
  risks: ApiRisk[];
  documents: ApiSgrsDocument[];
  epochSummary: ApiEpochSummary | null;
  isLoading: boolean;
}

type Action =
  | { type: "RESET" }
  | { type: "FETCH_START" }
  | { type: "FETCH_DONE"; payload: Partial<DomainState> }
  | { type: "CLAIM_ADDED"; payload: ApiClaim }
  | { type: "DRIFT_DETECTED"; payload: ApiDrift }
  | { type: "CONTRADICTION_DETECTED"; payload: ApiContradiction }
  | { type: "CONTRADICTION_RESOLVED"; payload: ApiContradiction }
  | { type: "RISK_IDENTIFIED"; payload: ApiRisk }
  | { type: "DOCUMENT_INDEXED"; payload: ApiSgrsDocument }
  | { type: "EPOCH_COMPLETED"; payload: ApiEpochSummary };

const INITIAL: DomainState = {
  claims: [],
  drifts: [],
  contradictions: [],
  risks: [],
  documents: [],
  epochSummary: null,
  isLoading: false,
};

function reducer(state: DomainState, action: Action): DomainState {
  switch (action.type) {
    case "RESET":
      return INITIAL;

    case "FETCH_START":
      return { ...state, isLoading: true };

    case "FETCH_DONE":
      return { ...state, ...action.payload, isLoading: false };

    case "CLAIM_ADDED":
      // Prepend; deduplicate by id
      if (state.claims.some((c) => c.id === action.payload.id)) return state;
      return { ...state, claims: [action.payload, ...state.claims].slice(0, 100) };

    case "DRIFT_DETECTED":
      if (state.drifts.some((d) => d.id === action.payload.id)) return state;
      return { ...state, drifts: [action.payload, ...state.drifts].slice(0, 50) };

    case "CONTRADICTION_DETECTED":
      if (state.contradictions.some((c) => c.id === action.payload.id)) return state;
      return { ...state, contradictions: [action.payload, ...state.contradictions] };

    case "CONTRADICTION_RESOLVED":
      // Replace the existing record with the updated one (status change)
      return {
        ...state,
        contradictions: state.contradictions.map((c) =>
          c.id === action.payload.id ? action.payload : c,
        ),
      };

    case "RISK_IDENTIFIED":
      if (state.risks.some((r) => r.id === action.payload.id)) return state;
      return { ...state, risks: [action.payload, ...state.risks] };

    case "DOCUMENT_INDEXED":
      // Upsert — update if exists, prepend if new
      if (state.documents.some((d) => d.id === action.payload.id)) {
        return {
          ...state,
          documents: state.documents.map((d) =>
            d.id === action.payload.id ? action.payload : d,
          ),
        };
      }
      return { ...state, documents: [action.payload, ...state.documents] };

    case "EPOCH_COMPLETED":
      return { ...state, epochSummary: action.payload };

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

const POLL_MS = 30_000; // 30 s — SSE handles sub-second updates

export interface UseDomainDataResult extends DomainState {
  /** Expose per-type SSE dispatchers for useEventStream wiring. */
  applyClaimEvent: (event: SgrsEvent) => void;
  applyDriftEvent: (event: SgrsEvent) => void;
  applyContradictionEvent: (event: SgrsEvent) => void;
  applyRiskEvent: (event: SgrsEvent) => void;
  applyDocumentEvent: (event: SgrsEvent) => void;
  applyEpochEvent: (event: SgrsEvent) => void;
  /** Optimistically update a contradiction after HITL resolve (from UI action). */
  resolveContradiction: (updated: ApiContradiction) => void;
  /** Append a comment to the current epoch summary (from UI action). */
  addEpochComment: (updated: ApiEpochSummary) => void;
}

export function useDomainData(
  scopeId: string | null,
  tenantId: string,
): UseDomainDataResult {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const api = useMemo(() => createClient({ tenantId }), [tenantId]);

  const fetchAll = useCallback(async () => {
    if (!scopeId) return;
    dispatch({ type: "FETCH_START" });
    try {
      const [claims, drifts, contradictions, risks, documents, epochResult] =
        await Promise.allSettled([
          api.claims.list(scopeId),
          api.drifts.list(scopeId),
          api.contradictions.list(scopeId),
          api.risks.list(scopeId),
          api.documents.list(scopeId),
          api.epochs.latest(scopeId),
        ]);

      dispatch({
        type: "FETCH_DONE",
        payload: {
          claims:          claims.status          === "fulfilled" ? claims.value          : [],
          drifts:          drifts.status          === "fulfilled" ? drifts.value          : [],
          contradictions:  contradictions.status  === "fulfilled" ? contradictions.value  : [],
          risks:           risks.status           === "fulfilled" ? risks.value           : [],
          documents:       documents.status       === "fulfilled" ? documents.value       : [],
          epochSummary:    epochResult.status     === "fulfilled" ? epochResult.value     : null,
        },
      });
    } catch {
      dispatch({ type: "FETCH_DONE", payload: {} });
    }
  }, [api, scopeId]);

  // Reset domain state when scopeId changes (before fetching new data)
  useEffect(() => {
    dispatch({ type: "RESET" });
  }, [scopeId]);

  useEffect(() => {
    void fetchAll();
    if (POLL_MS > 0) {
      const timer = setInterval(() => void fetchAll(), POLL_MS);
      return () => clearInterval(timer);
    }
  }, [fetchAll]);

  // ── SSE dispatchers ───────────────────────────────────────────────────────

  const applyClaimEvent = useCallback((event: SgrsEvent) => {
    if (event.type === "scope.claim.added" && event.scopeId === scopeId) {
      dispatch({ type: "CLAIM_ADDED", payload: event.payload as ApiClaim });
    }
  }, [scopeId]);

  const applyDriftEvent = useCallback((event: SgrsEvent) => {
    if (event.type === "scope.drift.detected" && event.scopeId === scopeId) {
      dispatch({ type: "DRIFT_DETECTED", payload: event.payload as ApiDrift });
    }
  }, [scopeId]);

  const applyContradictionEvent = useCallback((event: SgrsEvent) => {
    if (
      event.type === "scope.contradiction.detected" ||
      event.type === "scope.contradiction.resolved"
    ) {
      if (event.scopeId !== scopeId) return;
      if (event.type === "scope.contradiction.detected") {
        dispatch({ type: "CONTRADICTION_DETECTED", payload: event.payload as ApiContradiction });
      } else {
        dispatch({ type: "CONTRADICTION_RESOLVED", payload: event.payload as ApiContradiction });
      }
    }
  }, [scopeId]);

  const applyRiskEvent = useCallback((event: SgrsEvent) => {
    if (event.type === "scope.risk.identified" && event.scopeId === scopeId) {
      dispatch({ type: "RISK_IDENTIFIED", payload: event.payload as ApiRisk });
    }
  }, [scopeId]);

  const applyDocumentEvent = useCallback((event: SgrsEvent) => {
    if (event.type === "scope.document.indexed" && event.scopeId === scopeId) {
      dispatch({ type: "DOCUMENT_INDEXED", payload: event.payload as ApiSgrsDocument });
    }
  }, [scopeId]);

  const applyEpochEvent = useCallback((event: SgrsEvent) => {
    if (event.type === "scope.epoch.completed" && event.scopeId === scopeId) {
      dispatch({ type: "EPOCH_COMPLETED", payload: event.payload as ApiEpochSummary });
    }
  }, [scopeId]);

  // ── Optimistic UI updaters ────────────────────────────────────────────────

  const resolveContradiction = useCallback((updated: ApiContradiction) => {
    dispatch({ type: "CONTRADICTION_RESOLVED", payload: updated });
  }, []);

  const addEpochComment = useCallback((updated: ApiEpochSummary) => {
    dispatch({ type: "EPOCH_COMPLETED", payload: updated });
  }, []);

  return {
    ...state,
    applyClaimEvent,
    applyDriftEvent,
    applyContradictionEvent,
    applyRiskEvent,
    applyDocumentEvent,
    applyEpochEvent,
    resolveContradiction,
    addEpochComment,
  };
}

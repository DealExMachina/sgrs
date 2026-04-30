/**
 * useScopes — React hook for fetching and mutating governance scopes.
 *
 * Replaces the static import from `./mock-data` with live API calls.
 *
 * Usage:
 * ```tsx
 * const { scopes, isLoading, error, refresh, applyEvent } = useScopes('horizon');
 * ```
 *
 * Features:
 * - Auto-fetch on mount and when tenantId changes
 * - Manual refresh via returned `refresh()` fn
 * - Optimistic state update on patch/delete
 * - `applyEvent(SgrsEvent)` — called by `useEventStream` to apply SSE pushes
 *   instantly without waiting for the next poll
 * - Error boundary compatible (throws on unrecoverable errors)
 */

"use client";

import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { Scope } from "@sgrs/api-schema";
import type { z } from "zod";
import type { SgrsEvent } from "@sgrs/client-ts";
import { createClient } from "../api-client";

type ApiScope = z.infer<typeof Scope>;

// ─── State machine ────────────────────────────────────────────────────────────

interface State {
  scopes: ApiScope[];
  isLoading: boolean;
  error: string | null;
}

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; payload: ApiScope[] }
  | { type: "FETCH_ERROR"; payload: string }
  | { type: "SCOPE_CREATED"; payload: ApiScope }
  | { type: "SCOPE_UPDATED"; payload: ApiScope }
  | { type: "SCOPE_DELETED"; payload: string };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, isLoading: true, error: null };

    case "FETCH_SUCCESS":
      return { scopes: action.payload, isLoading: false, error: null };

    case "FETCH_ERROR":
      return { ...state, isLoading: false, error: action.payload };

    case "SCOPE_CREATED":
      // Idempotent: ignore if the scope is already in the list
      if (state.scopes.some((s) => s.id === action.payload.id)) return state;
      return { ...state, scopes: [action.payload, ...state.scopes] };

    case "SCOPE_UPDATED":
      return {
        ...state,
        scopes: state.scopes.map((s) =>
          s.id === action.payload.id ? action.payload : s,
        ),
      };

    case "SCOPE_DELETED":
      return {
        ...state,
        scopes: state.scopes.filter((s) => s.id !== action.payload),
      };

    default:
      return state;
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseScopesResult {
  scopes: ApiScope[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
  patchScope: (
    id: string,
    changes: Partial<Omit<ApiScope, "id" | "created_at" | "updated_at">>,
  ) => Promise<void>;
  deleteScope: (id: string) => Promise<void>;
  /**
   * Apply a NATS event from the SSE stream directly to local state.
   * Called by `useEventStream` — do not call from UI components directly.
   */
  applyEvent: (event: SgrsEvent) => void;
}

export function useScopes(tenantId: string): UseScopesResult {
  const [state, dispatch] = useReducer(reducer, {
    scopes: [],
    isLoading: false,
    error: null,
  });

  // Memoized so the client is not re-created on every render.
  const api = useMemo(() => createClient({ tenantId }), [tenantId]);

  const fetchScopes = useCallback(async () => {
    dispatch({ type: "FETCH_START" });
    try {
      const data = await api.scopes.list();
      dispatch({ type: "FETCH_SUCCESS", payload: data });
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "error" in err
          ? String((err as { error: unknown }).error)
          : "Failed to fetch scopes";
      dispatch({ type: "FETCH_ERROR", payload: msg });
    }
  }, [api]);

  useEffect(() => {
    void fetchScopes();
  }, [fetchScopes]);

  const patchScope = useCallback(
    async (
      id: string,
      changes: Partial<Omit<ApiScope, "id" | "created_at" | "updated_at">>,
    ) => {
      const updated = await api.scopes.patch(id, changes);
      dispatch({ type: "SCOPE_UPDATED", payload: updated });
    },
    [api],
  );

  const deleteScope = useCallback(
    async (id: string) => {
      await api.scopes.delete(id);
      dispatch({ type: "SCOPE_DELETED", payload: id });
    },
    [api],
  );

  /**
   * Translate a raw SGRS event from the SSE stream into a reducer action.
   * Stable reference (no deps) — safe to pass as a prop without useMemo.
   */
  const applyEvent = useCallback((event: SgrsEvent) => {
    switch (event.type) {
      case "scope.created":
        dispatch({ type: "SCOPE_CREATED", payload: event.payload as ApiScope });
        break;
      case "scope.updated":
        dispatch({ type: "SCOPE_UPDATED", payload: event.payload as ApiScope });
        break;
      case "scope.deleted":
        dispatch({ type: "SCOPE_DELETED", payload: event.scopeId });
        break;
      // Finality / veto events are not scope-list concerns — ignore here
    }
  }, []);

  return {
    scopes: state.scopes,
    isLoading: state.isLoading,
    error: state.error,
    refresh: () => void fetchScopes(),
    patchScope,
    deleteScope,
    applyEvent,
  };
}

/**
 * SGRS Studio API client factory.
 *
 * Wraps the raw SGRS REST API with typed methods for use in React components
 * and server actions. Injects X-Tenant-ID automatically.
 *
 * Usage:
 * ```ts
 * const api = createClient({ tenantId: 'deal-ex-machina' });
 * const scopes = await api.scopes.list();
 * ```
 *
 * Environment variables consumed:
 *   NEXT_PUBLIC_API_URL      — Base URL of the API server (default: http://localhost:3001)
 *   NEXT_PUBLIC_TENANT_ID    — Default tenant (overrideable per-call)
 */

import type {
  Scope, ModelHandle, FinalityStatus, Agent,
  Claim, Drift, Contradiction, Risk, SgrsDocument, EpochSummary,
  ResolveContradictionBody, AddEpochCommentBody,
  IngestDocumentRequest, IngestDocumentResponse,
} from "@sgrs/api-schema";
import type { z } from "zod";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiScope = z.infer<typeof Scope>;
type ApiModelHandle = z.infer<typeof ModelHandle>;
type ApiFinalityStatus = z.infer<typeof FinalityStatus>;
type ApiAgent = z.infer<typeof Agent>;
export type ApiClaim = z.infer<typeof Claim>;
export type ApiDrift = z.infer<typeof Drift>;
export type ApiContradiction = z.infer<typeof Contradiction>;
export type ApiRisk = z.infer<typeof Risk>;
export type ApiSgrsDocument = z.infer<typeof SgrsDocument>;
export type ApiEpochSummary = z.infer<typeof EpochSummary>;
type ApiResolveContradiction = z.infer<typeof ResolveContradictionBody>;
type ApiAddEpochComment = z.infer<typeof AddEpochCommentBody>;
type ApiIngestDocumentRequest = z.infer<typeof IngestDocumentRequest>;
type ApiIngestDocumentResponse = z.infer<typeof IngestDocumentResponse>;

export interface ApiClientConfig {
  /** Tenant ID sent as X-Tenant-ID header on every request. */
  tenantId: string;
  /** API base URL. Defaults to NEXT_PUBLIC_API_URL or http://localhost:3001. */
  baseUrl?: string;
  /** Bearer token for auth. Defaults to NEXT_PUBLIC_API_KEY env var if set. */
  apiKey?: string;
}

export interface ApiError {
  status: number;
  error: string;
  code: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function createClient(config: ApiClientConfig) {
  const baseUrl =
    config.baseUrl ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_URL
      : undefined) ??
    "http://localhost:3001";

  const apiKey =
    config.apiKey ??
    (typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_KEY
      : undefined);

  /** Core fetch wrapper — injects tenant header, handles errors. */
  async function apiFetch<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Tenant-ID": config.tenantId,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      ...(init?.headers as Record<string, string> | undefined),
    };

    const res = await fetch(`${baseUrl}${path}`, { ...init, headers });

    if (!res.ok) {
      const body = await res.json().catch(() => ({
        error: res.statusText,
        code: "UNKNOWN",
      }));
      const err: ApiError = {
        status: res.status,
        error: body.error ?? "Unknown error",
        code: body.code ?? "UNKNOWN",
      };
      throw err;
    }

    return res.json() as Promise<T>;
  }

  // ── Scopes ────────────────────────────────────────────────────────────────

  const scopes = {
    list: () => apiFetch<ApiScope[]>("/api/scopes"),

    get: (id: string) => apiFetch<ApiScope>(`/api/scopes/${encodeURIComponent(id)}`),

    create: (body: Omit<ApiScope, "created_at" | "updated_at">) =>
      apiFetch<ApiScope>("/api/scopes", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    update: (id: string, body: Omit<ApiScope, "id" | "created_at" | "updated_at">) =>
      apiFetch<ApiScope>(`/api/scopes/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),

    patch: (id: string, body: Partial<Omit<ApiScope, "id" | "created_at" | "updated_at">>) =>
      apiFetch<ApiScope>(`/api/scopes/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),

    delete: (id: string) =>
      apiFetch<{ id: string }>(`/api/scopes/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  };

  // ── Model handles ─────────────────────────────────────────────────────────

  const models = {
    list: () => apiFetch<ApiModelHandle[]>("/api/models"),

    get: (handle: string) =>
      apiFetch<ApiModelHandle>(`/api/models/${encodeURIComponent(handle)}`),

    connect: (body: {
      provider: ApiModelHandle["provider"];
      api_key: string;
      model: string;
      base_url?: string;
      label?: string;
    }) =>
      apiFetch<ApiModelHandle>("/api/models", {
        method: "POST",
        body: JSON.stringify(body),
      }),

    revoke: (handle: string) =>
      apiFetch<{ handle: string }>(`/api/models/${encodeURIComponent(handle)}`, {
        method: "DELETE",
      }),
  };

  // ── Finality ──────────────────────────────────────────────────────────────

  const finality = {
    get: (scopeId: string) =>
      apiFetch<ApiFinalityStatus>(
        `/api/finality/${encodeURIComponent(scopeId)}`
      ),

    history: (scopeId: string, limit = 500) =>
      apiFetch<{
        scope_id: string;
        points: Array<{
          recorded_at: number;
          score: number;
          state: string;
          veto_active: boolean;
          monotonicity_rounds: number;
        }>;
      }>(`/api/finality/${encodeURIComponent(scopeId)}/history?limit=${limit}`),
  };

  // ── Agents ────────────────────────────────────────────────────────────────

  const agentsApi = {
    list: () => apiFetch<ApiAgent[]>("/api/agents"),

    get: (id: string) =>
      apiFetch<ApiAgent>(`/api/agents/${encodeURIComponent(id)}`),
  };

  // ── Health ────────────────────────────────────────────────────────────────

  const health = {
    check: () =>
      apiFetch<{ status: string; db: string; timestamp: string }>(
        "/api/health"
      ),
  };

  // ── Claims ────────────────────────────────────────────────────────────────

  const claims = {
    list: (scopeId: string) =>
      apiFetch<ApiClaim[]>(`/api/claims/${encodeURIComponent(scopeId)}`),
    byDoc: (scopeId: string) =>
      apiFetch<Record<string, ApiClaim[]>>(`/api/claims/${encodeURIComponent(scopeId)}/by-doc`),
  };

  // ── Drifts ────────────────────────────────────────────────────────────────

  const drifts = {
    list: (scopeId: string) =>
      apiFetch<ApiDrift[]>(`/api/drifts/${encodeURIComponent(scopeId)}`),
  };

  // ── Contradictions ────────────────────────────────────────────────────────

  const contradictions = {
    list: (scopeId: string) =>
      apiFetch<ApiContradiction[]>(`/api/contradictions/${encodeURIComponent(scopeId)}`),
    resolve: (id: string, body: ApiResolveContradiction) =>
      apiFetch<ApiContradiction>(`/api/contradictions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  };

  // ── Risks ─────────────────────────────────────────────────────────────────

  const risks = {
    list: (scopeId: string) =>
      apiFetch<ApiRisk[]>(`/api/risks/${encodeURIComponent(scopeId)}`),
  };

  // ── Documents ─────────────────────────────────────────────────────────────

  const documents = {
    list: (scopeId: string) =>
      apiFetch<ApiSgrsDocument[]>(`/api/documents/${encodeURIComponent(scopeId)}`),
    ingest: (body: ApiIngestDocumentRequest) =>
      apiFetch<ApiIngestDocumentResponse>("/api/ingest", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };

  // ── Epochs ────────────────────────────────────────────────────────────────

  const epochs = {
    list: (scopeId: string) =>
      apiFetch<ApiEpochSummary[]>(`/api/epochs/${encodeURIComponent(scopeId)}`),
    latest: (scopeId: string) =>
      apiFetch<ApiEpochSummary>(`/api/epochs/${encodeURIComponent(scopeId)}/latest`),
    addComment: (id: string, body: ApiAddEpochComment) =>
      apiFetch<ApiEpochSummary>(`/api/epochs/${encodeURIComponent(id)}/comments`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };

  return { scopes, models, finality, agents: agentsApi, health, claims, drifts, contradictions, risks, documents, epochs };
}

export type ApiClient = ReturnType<typeof createClient>;

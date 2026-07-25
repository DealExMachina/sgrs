import { TenantId } from "@sgrs/api-schema";
import type * as schema from "@sgrs/api-schema";
import { EventsApi, type NatsConfig, type TLSConfig } from "./events/api.js";

export type { NatsConfig, TLSConfig };

/**
 * Configuration for the SGRS API client.
 */
export interface ClientConfig {
  /**
   * Base URL of the SGRS API (e.g., https://api.sgrs.example.com)
   */
  baseUrl: string;

  /**
   * Tenant ID sent as X-Tenant-ID on every request.
   * Required by the API server for all authenticated routes.
   */
  tenantId?: string;

  /**
   * Optional API key for authentication.
   * If provided, will be sent as Authorization: Bearer {apiKey}
   */
  apiKey?: string;

  /**
   * Optional custom fetch implementation (for Node.js or custom environments)
   * Defaults to global fetch
   */
  fetch?: typeof fetch;

  /**
   * Request timeout in milliseconds (default: 30000)
   */
  timeout?: number;

  /**
   * Optional NATS configuration for real-time event streaming.
   *
   * When provided, `client.events` becomes active. Call `await client.connect()`
   * to establish the NATS connection, then subscribe to governance events.
   *
   * The `nats` npm package must be installed separately:
   *   npm install nats
   *
   * @example
   * ```ts
   * const client = createClient({
   *   baseUrl: 'https://api.example.com',
   *   tenantId: 'acme',
   *   nats: { servers: 'nats://localhost:4222', token: process.env.NATS_TOKEN },
   * });
   * await client.connect();
   * client.events.onVetoActivated('acme', (event) => haltSwarm(event));
   * ```
   */
  nats?: NatsConfig;
}

/**
 * Error response from the API
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * HTTP response wrapper
 */
export interface ApiResponse<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: ApiError;
}

/**
 * Request body for `POST /api/claims`.
 * Mirrors the `CreateClaimBody` zod schema in apps/api.
 */
export interface CreateClaimBody {
  scope_id: string;
  text: string;
  source: string;
  /** Provenance link to the originating document (documents.id). */
  document_id?: string;
  dimension?: schema.FinalityDimension;
  confidence: number;
  /** Convergence round (defaults to 0 server-side). */
  round?: number;
}

/**
 * Request body for `POST /api/drifts`.
 * Mirrors the `CreateDriftBody` zod schema in apps/api.
 */
export interface CreateDriftBody {
  scope_id: string;
  claim_id?: string;
  subject: string;
  previous_confidence: number;
  current_confidence: number;
  /** Signed confidence delta. Negative means degradation. */
  delta: number;
  severity: schema.DriftSeverity;
  round?: number;
}

/**
 * Request body for `POST /api/contradictions`.
 * Mirrors the `CreateContradictionBody` zod schema in apps/api.
 */
export interface CreateContradictionBody {
  scope_id: string;
  claim_a: string;
  claim_b: string;
  source_a: string;
  source_b: string;
  severity: schema.ContradictionSeverity;
  round?: number;
}

/**
 * Request body for `POST /api/risks`.
 * Mirrors the `CreateRiskBody` zod schema in apps/api.
 */
export interface CreateRiskBody {
  scope_id: string;
  description: string;
  level: schema.RiskLevel;
  category?: string;
  source: string;
  document_id?: string;
  round?: number;
}

/**
 * Request body for `POST /api/documents`.
 * Mirrors the `CreateDocumentBody` zod schema in apps/api.
 */
export interface CreateDocumentBody {
  scope_id: string;
  name: string;
  type: string;
  status?: schema.DocumentStatus;
  /** Stable provenance reference (content hash, source URI, external id). */
  provenance?: string;
}

/**
 * Request body for `PATCH /api/documents/:id`.
 * Mirrors the `PatchDocumentBody` zod schema in apps/api.
 */
export interface PatchDocumentBody {
  status?: schema.DocumentStatus;
  claim_count?: number;
  provenance?: string;
}

/**
 * Request body for `POST /api/epochs`.
 * Mirrors the `CreateEpochBody` zod schema in apps/api.
 */
export interface CreateEpochBody {
  scope_id: string;
  round: number;
  summary_text: string;
  claim_count?: number;
  drift_count?: number;
  contradiction_count?: number;
  risk_count?: number;
  score: number;
  state: schema.ScopeState;
}

/**
 * SGRS REST API client for TypeScript.
 *
 * All request and response types are validated against the Zod schemas
 * defined in @sgrs/api-schema, ensuring type safety and runtime validation.
 *
 * Usage:
 *   const client = new Client({ baseUrl: 'http://localhost:3003' });
 *   const scopes = await client.scopes.list();
 *   const scope = await client.scopes.get('my-scope');
 */
export class Client {
  private config: ClientConfig;
  private fetchFn: typeof fetch;

  /**
   * Real-time event transport (NATS).
   *
   * Always present; active only when `nats` is in ClientConfig.
   * Call `await client.connect()` to establish the connection.
   *
   * Throws `NatsNotConfiguredError` when accessed without NATS config.
   */
  readonly events: EventsApi;

  constructor(config: ClientConfig) {
    let next = config;
    if (config.tenantId !== undefined && config.tenantId !== "") {
      const trimmed = config.tenantId.trim();
      const parsed = TenantId.safeParse(trimmed);
      if (!parsed.success) {
        throw new Error(
          `Invalid tenantId: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        );
      }
      next = { ...config, tenantId: parsed.data };
    }
    this.config = next;
    this.fetchFn = config.fetch || globalThis.fetch;
    this.events = new EventsApi(config.nats);
  }

  /**
   * Connect the NATS real-time transport.
   * Safe no-op when `nats` is not in ClientConfig.
   * Must be called before using `client.events` subscriptions.
   */
  async connect(): Promise<void> {
    await this.events.connect();
  }

  /**
   * Close the NATS connection, draining in-flight messages.
   * Safe no-op when NATS is not configured or not connected.
   */
  async close(): Promise<void> {
    await this.events.close();
  }

  /**
   * Make an HTTP request to the API.
   * Handles serialization, error handling, and response parsing.
   */
  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = new URL(path, this.config.baseUrl).toString();
    const timeout = this.config.timeout ?? 30000;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };

      if (this.config.apiKey) {
        headers["Authorization"] = `Bearer ${this.config.apiKey}`;
      }

      if (this.config.tenantId) {
        headers["X-Tenant-ID"] = this.config.tenantId;
      }

      const response = await this.fetchFn(url, {
        method,
        headers,
        signal: controller.signal,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });

      const contentType = response.headers.get("content-type");
      let data: unknown;

      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error:
            typeof data === "object" && data !== null
              ? (data as ApiError)
              : {
                  code: `HTTP_${response.status}`,
                  message: `HTTP ${response.status}`,
                },
        };
      }

      return {
        ok: true,
        status: response.status,
        data: data as T,
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          ok: false,
          status: 408,
          error: {
            code: "REQUEST_TIMEOUT",
            message: `Request timeout after ${timeout}ms`,
          },
        };
      }

      return {
        ok: false,
        status: 0,
        error: {
          code: "NETWORK_ERROR",
          message:
            error instanceof Error ? error.message : "Unknown network error",
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Scopes API
   * Manage governance scopes and their lifecycle
   */
  scopes = {
    /** List all scopes for the configured tenant. */
    list: async (): Promise<ApiResponse<schema.Scope[]>> => {
      return this.request("GET", "/api/scopes");
    },

    /** Get a specific scope by ID. */
    get: async (scopeId: string): Promise<ApiResponse<schema.Scope>> => {
      return this.request("GET", `/api/scopes/${encodeURIComponent(scopeId)}`);
    },

    /**
     * Create a new scope.
     *
     * The caller supplies the scope `id` — a human-readable slug (lowercase
     * a-z, 0-9, hyphens; e.g. `acme-vendor-acquisition`). This matches the
     * server contract: `POST /api/scopes` requires `id` in the request body.
     */
    create: async (
      body: Omit<schema.Scope, "created_at" | "updated_at">,
    ): Promise<ApiResponse<schema.Scope>> => {
      return this.request("POST", "/api/scopes", body);
    },

    /** Full replace of an existing scope. */
    update: async (
      scopeId: string,
      body: Omit<schema.Scope, "id" | "created_at" | "updated_at">,
    ): Promise<ApiResponse<schema.Scope>> => {
      return this.request("PUT", `/api/scopes/${encodeURIComponent(scopeId)}`, body);
    },

    /** Partial update of an existing scope. */
    patch: async (
      scopeId: string,
      body: Partial<Omit<schema.Scope, "id" | "created_at" | "updated_at">>,
    ): Promise<ApiResponse<schema.Scope>> => {
      return this.request("PATCH", `/api/scopes/${encodeURIComponent(scopeId)}`, body);
    },

    /** Delete a scope. */
    delete: async (scopeId: string): Promise<ApiResponse<{ id: string }>> => {
      return this.request("DELETE", `/api/scopes/${encodeURIComponent(scopeId)}`);
    },
  };

  /**
   * Models API
   * Connect and manage LLM model providers
   */
  models = {
    /** List all connected model handles for the tenant. */
    list: async (): Promise<ApiResponse<schema.ModelHandle[]>> => {
      return this.request("GET", "/api/models");
    },

    /**
     * Connect a new model provider and store its API key encrypted at rest.
     * The plaintext key is never returned after this call — only the handle.
     */
    connect: async (
      body: schema.ConnectModelRequest,
    ): Promise<ApiResponse<schema.ModelHandle>> => {
      return this.request("POST", "/api/models", body);
    },

    /** Get a connected model handle (no API key in response). */
    get: async (handle: string): Promise<ApiResponse<schema.ModelHandle>> => {
      return this.request("GET", `/api/models/${encodeURIComponent(handle)}`);
    },

    /** Revoke a model handle (permanently removes the encrypted key). */
    revoke: async (handle: string): Promise<ApiResponse<{ handle: string }>> => {
      return this.request("DELETE", `/api/models/${encodeURIComponent(handle)}`);
    },
  };

  /**
   * Finality API — query convergence status and time-series history.
   */
  finality = {
    /** Get current finality status for a scope. */
    status: async (scopeId: string): Promise<ApiResponse<schema.FinalityStatus>> => {
      return this.request("GET", `/api/finality/${encodeURIComponent(scopeId)}`);
    },

    /**
     * Upsert finality status (called by the convergence kernel after each round).
     * Also appends a DuckDB time-series snapshot server-side.
     */
    upsert: async (
      scopeId: string,
      body: Omit<schema.FinalityStatus, "scope_id">,
    ): Promise<ApiResponse<schema.FinalityStatus>> => {
      return this.request("POST", `/api/finality/${encodeURIComponent(scopeId)}`, body);
    },

    /** Get a finality certificate for a specific convergence round. */
    certificate: async (
      scopeId: string,
      round: number,
    ): Promise<ApiResponse<schema.FinalityCertificate>> => {
      return this.request(
        "GET",
        `/api/finality/${encodeURIComponent(scopeId)}/certificate/${round}`,
      );
    },

    /** Verify a finality certificate signature. */
    verify: async (
      certificate: schema.FinalityCertificate,
    ): Promise<ApiResponse<{ valid: boolean }>> => {
      return this.request("POST", "/api/finality/verify", certificate);
    },

    /**
     * Get historical finality time-series data points (from DuckDB).
     * Useful for convergence trend charts.
     */
    history: async (
      scopeId: string,
      limit = 500,
    ): Promise<
      ApiResponse<{
        scope_id: string;
        points: Array<{
          recorded_at: number;
          score: number;
          state: string;
          veto_active: boolean;
          monotonicity_rounds: number;
        }>;
      }>
    > => {
      return this.request(
        "GET",
        `/api/finality/${encodeURIComponent(scopeId)}/history?limit=${limit}`,
      );
    },
  };

  /**
   * Agents API — read-only registry of swarm agents.
   */
  agents = {
    /** List all agents registered for the tenant. */
    list: async (): Promise<ApiResponse<schema.Agent[]>> => {
      return this.request("GET", "/api/agents");
    },

    /** Get a specific agent by ID. */
    get: async (agentId: string): Promise<ApiResponse<schema.Agent>> => {
      return this.request("GET", `/api/agents/${encodeURIComponent(agentId)}`);
    },
  };

  /**
   * Health check — no auth or tenant header required.
   */
  health = {
    check: async (): Promise<ApiResponse<{ status: string; db: string; timestamp: string }>> => {
      return this.request("GET", "/api/health");
    },
  };

  /**
   * Ingest API — public product entrypoint into the headless swarm.
   */
  ingest = {
    document: async (
      body: schema.IngestDocumentRequest,
    ): Promise<ApiResponse<schema.IngestDocumentResponse>> => {
      return this.request("POST", "/api/ingest", body);
    },
  };

  /**
   * Claims API — extracted factual assertions.
   */
  claims = {
    /** List claims extracted for a scope (newest-first). */
    list: async (scopeId: string): Promise<ApiResponse<schema.Claim[]>> => {
      return this.request("GET", `/api/claims/${encodeURIComponent(scopeId)}`);
    },

    /** Create a claim (kernel → API after extracting from a document). */
    create: async (body: CreateClaimBody): Promise<ApiResponse<schema.Claim>> => {
      return this.request("POST", "/api/claims", body);
    },

    /**
     * Group a scope's claims by source document.
     * Returns an object mapping each `source` to its list of claims.
     */
    byDoc: async (
      scopeId: string,
    ): Promise<ApiResponse<Record<string, schema.Claim[]>>> => {
      return this.request("GET", `/api/claims/${encodeURIComponent(scopeId)}/by-doc`);
    },
  };

  /**
   * Drifts API — confidence changes detected between rounds.
   */
  drifts = {
    /** List drifts detected for a scope (highest severity first). */
    list: async (scopeId: string): Promise<ApiResponse<schema.Drift[]>> => {
      return this.request("GET", `/api/drifts/${encodeURIComponent(scopeId)}`);
    },

    /** Create a drift (comparator agent). */
    create: async (body: CreateDriftBody): Promise<ApiResponse<schema.Drift>> => {
      return this.request("POST", "/api/drifts", body);
    },
  };

  /**
   * Contradictions API — conflicting claim pairs.
   */
  contradictions = {
    /** List contradictions detected for a scope (open/critical first). */
    list: async (scopeId: string): Promise<ApiResponse<schema.Contradiction[]>> => {
      return this.request("GET", `/api/contradictions/${encodeURIComponent(scopeId)}`);
    },

    /** Create a contradiction (comparator agent). */
    create: async (
      body: CreateContradictionBody,
    ): Promise<ApiResponse<schema.Contradiction>> => {
      return this.request("POST", "/api/contradictions", body);
    },

    /** Resolve or defer a contradiction (HITL). */
    resolve: async (
      id: string,
      body: schema.ResolveContradictionBody,
    ): Promise<ApiResponse<schema.Contradiction>> => {
      return this.request("PATCH", `/api/contradictions/${encodeURIComponent(id)}`, body);
    },
  };

  /**
   * Risks API — identified risk items.
   */
  risks = {
    /** List risks identified for a scope (critical first). */
    list: async (scopeId: string): Promise<ApiResponse<schema.Risk[]>> => {
      return this.request("GET", `/api/risks/${encodeURIComponent(scopeId)}`);
    },

    /** Create a risk (risk-assessment agent). */
    create: async (body: CreateRiskBody): Promise<ApiResponse<schema.Risk>> => {
      return this.request("POST", "/api/risks", body);
    },
  };

  /**
   * Documents API — ingested source material.
   */
  documents = {
    /** List documents ingested into a scope (newest-first). */
    list: async (scopeId: string): Promise<ApiResponse<schema.SgrsDocument[]>> => {
      return this.request("GET", `/api/documents/${encodeURIComponent(scopeId)}`);
    },

    /** Register a document (kernel after indexing). */
    create: async (body: CreateDocumentBody): Promise<ApiResponse<schema.SgrsDocument>> => {
      return this.request("POST", "/api/documents", body);
    },

    /** Update a document's status and/or claim_count. */
    patch: async (
      id: string,
      body: PatchDocumentBody,
    ): Promise<ApiResponse<schema.SgrsDocument>> => {
      return this.request("PATCH", `/api/documents/${encodeURIComponent(id)}`, body);
    },
  };

  /**
   * Epochs API — per-round narrative summaries.
   */
  epochs = {
    /** List epoch summaries for a scope (newest-first). */
    list: async (scopeId: string): Promise<ApiResponse<schema.EpochSummary[]>> => {
      return this.request("GET", `/api/epochs/${encodeURIComponent(scopeId)}`);
    },

    /** Get the latest epoch summary for a scope. */
    latest: async (scopeId: string): Promise<ApiResponse<schema.EpochSummary>> => {
      return this.request("GET", `/api/epochs/${encodeURIComponent(scopeId)}/latest`);
    },

    /** Create an epoch summary (kernel at round completion). */
    create: async (body: CreateEpochBody): Promise<ApiResponse<schema.EpochSummary>> => {
      return this.request("POST", "/api/epochs", body);
    },

    /**
     * Add a HITL comment to an epoch summary.
     * Returns the updated epoch summary (with the new comment appended).
     */
    addComment: async (
      id: string,
      body: schema.AddEpochCommentBody,
    ): Promise<ApiResponse<schema.EpochSummary>> => {
      return this.request("POST", `/api/epochs/${encodeURIComponent(id)}/comments`, body);
    },
  };
}

/**
 * Create a new SGRS API client with the given configuration.
 */
export function createClient(config: ClientConfig): Client {
  return new Client(config);
}

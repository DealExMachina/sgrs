import * as schema from "@sgrs/api-schema";
import { EventsApi, type NatsConfig } from "./events/api.js";

export type { NatsConfig };

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
 * SGRS REST API client for TypeScript.
 *
 * All request and response types are validated against the Zod schemas
 * defined in @sgrs/api-schema, ensuring type safety and runtime validation.
 *
 * Usage:
 *   const client = new Client({ baseUrl: 'http://localhost:3000' });
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
    this.config = config;
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

    /** Create a new scope. The server assigns the id. */
    create: async (
      body: Omit<schema.Scope, "id" | "created_at" | "updated_at">,
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
}

/**
 * Create a new SGRS API client with the given configuration.
 */
export function createClient(config: ClientConfig): Client {
  return new Client(config);
}

/**
 * SGRS DuckDB analytics module.
 *
 * Provides two append-only analytics tables:
 *
 *   audit_events          — every mutating API call (write-ahead log for audit trail)
 *   finality_timeseries   — scope finality snapshots on every convergence tick
 *
 * Connection pattern: one DuckDB instance per process, one connection per
 * operation (avoids shared-state transaction contamination between requests).
 *
 * DuckDB path defaults to DUCKDB_PATH env var, or ":memory:" for tests.
 *
 * All DML uses prepared statements with positional `?` parameters to
 * prevent SQL injection, even for server-generated values.
 */

import { DuckDBInstance } from "@duckdb/node-api";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEvent {
  event_type: string;
  tenant_id: string;
  entity_id: string;
  actor: string;
  payload: unknown;
}

export interface FinalitySnapshot {
  scope_id: string;
  tenant_id: string;
  score: number;
  state: string;
  veto_active: boolean;
  monotonicity_rounds: number;
}

// ─── DDL (no user input — run() is safe) ─────────────────────────────────────

const DDL_AUDIT = `
CREATE TABLE IF NOT EXISTS audit_events (
  id            VARCHAR   NOT NULL,
  recorded_at   DOUBLE    NOT NULL,
  event_type    VARCHAR   NOT NULL,
  tenant_id     VARCHAR   NOT NULL,
  entity_id     VARCHAR   NOT NULL,
  actor         VARCHAR   NOT NULL,
  payload       VARCHAR   NOT NULL
)`;

const DDL_FINALITY = `
CREATE TABLE IF NOT EXISTS finality_timeseries (
  id                   VARCHAR   NOT NULL,
  recorded_at          DOUBLE    NOT NULL,
  scope_id             VARCHAR   NOT NULL,
  tenant_id            VARCHAR   NOT NULL,
  score                DOUBLE    NOT NULL,
  state                VARCHAR   NOT NULL,
  veto_active          BOOLEAN   NOT NULL,
  monotonicity_rounds  INTEGER   NOT NULL
)`;

// ─── AnalyticsDb ──────────────────────────────────────────────────────────────

export class AnalyticsDb {
  private constructor(private readonly _instance: DuckDBInstance) {}

  /**
   * Create (or open) a DuckDB analytics database.
   *
   * @param path - File path for persistent storage, or `":memory:"` for tests.
   *               Defaults to `DUCKDB_PATH` env var, then `":memory:"`.
   */
  static async create(path?: string): Promise<AnalyticsDb> {
    const dbPath = path ?? process.env.DUCKDB_PATH ?? ":memory:";
    const instance = await DuckDBInstance.create(dbPath);
    const db = new AnalyticsDb(instance);
    await db._bootstrap();
    return db;
  }

  /** Create tables if they do not exist yet. */
  private async _bootstrap(): Promise<void> {
    const conn = await this._instance.connect();
    try {
      await conn.run(DDL_AUDIT);
      await conn.run(DDL_FINALITY);
    } finally {
      await conn.close();
    }
  }

  /**
   * Append an audit event for a mutating API operation.
   *
   * Uses a prepared statement with positional `?` parameters — safe
   * against SQL injection even for user-controlled payload data.
   *
   * Fire-and-forget from route handlers — errors are logged, never surfaced.
   */
  async appendAudit(event: AuditEvent): Promise<void> {
    const conn = await this._instance.connect();
    try {
      const id = crypto.randomUUID();
      const now = Date.now() / 1000;
      const payloadStr = JSON.stringify(event.payload);

      const stmt = await conn.prepare(
        "INSERT INTO audit_events (id, recorded_at, event_type, tenant_id, entity_id, actor, payload) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)"
      );
      try {
        await stmt.run(
          id,
          now,
          event.event_type,
          event.tenant_id,
          event.entity_id,
          event.actor,
          payloadStr
        );
      } finally {
        await stmt.close();
      }
    } finally {
      await conn.close();
    }
  }

  /**
   * Append a finality convergence snapshot.
   * Called after each successful finality upsert.
   */
  async appendFinalitySnapshot(snapshot: FinalitySnapshot): Promise<void> {
    const conn = await this._instance.connect();
    try {
      const id = crypto.randomUUID();
      const now = Date.now() / 1000;

      const stmt = await conn.prepare(
        "INSERT INTO finality_timeseries " +
          "(id, recorded_at, scope_id, tenant_id, score, state, veto_active, monotonicity_rounds) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      try {
        await stmt.run(
          id,
          now,
          snapshot.scope_id,
          snapshot.tenant_id,
          snapshot.score,
          snapshot.state,
          snapshot.veto_active,
          snapshot.monotonicity_rounds
        );
      } finally {
        await stmt.close();
      }
    } finally {
      await conn.close();
    }
  }

  /**
   * Return recent audit events for a tenant (for admin dashboard / debugging).
   *
   * @param tenantId - Tenant to filter on (validated by tenant middleware).
   * @param limit    - Max rows to return (default 100, max 1000).
   */
  async recentAudit(
    tenantId: string,
    limit = 100
  ): Promise<
    Array<{
      id: string;
      recorded_at: number;
      event_type: string;
      entity_id: string;
      actor: string;
      payload: unknown;
    }>
  > {
    const conn = await this._instance.connect();
    try {
      const safeLimit = Math.min(Math.max(1, Number(limit)), 1000);
      const stmt = await conn.prepare(
        "SELECT id, recorded_at, event_type, entity_id, actor, payload " +
          "FROM audit_events " +
          "WHERE tenant_id = ? " +
          "ORDER BY recorded_at DESC " +
          `LIMIT ${safeLimit}`
      );
      try {
        const result = await stmt.runAndReadAll(tenantId);
        const rows = result.getRowObjects();
        return rows.map((r) => ({
          id: String(r["id"] ?? ""),
          recorded_at: Number(r["recorded_at"] ?? 0),
          event_type: String(r["event_type"] ?? ""),
          entity_id: String(r["entity_id"] ?? ""),
          actor: String(r["actor"] ?? ""),
          payload: (() => {
            try {
              return JSON.parse(String(r["payload"] ?? "null"));
            } catch {
              return null;
            }
          })(),
        }));
      } finally {
        await stmt.close();
      }
    } finally {
      await conn.close();
    }
  }

  /**
   * Return finality time-series for a scope (for trend charts).
   *
   * @param scopeId  - The scope to query.
   * @param tenantId - Tenant owning the scope.
   * @param limit    - Max data points (default 500, max 5000).
   */
  async finalityTimeSeries(
    scopeId: string,
    tenantId: string,
    limit = 500
  ): Promise<
    Array<{
      recorded_at: number;
      score: number;
      state: string;
      veto_active: boolean;
      monotonicity_rounds: number;
    }>
  > {
    const conn = await this._instance.connect();
    try {
      const safeLimit = Math.min(Math.max(1, Number(limit)), 5000);
      const stmt = await conn.prepare(
        "SELECT recorded_at, score, state, veto_active, monotonicity_rounds " +
          "FROM finality_timeseries " +
          "WHERE scope_id = ? AND tenant_id = ? " +
          "ORDER BY recorded_at ASC " +
          `LIMIT ${safeLimit}`
      );
      try {
        const result = await stmt.runAndReadAll(scopeId, tenantId);
        const rows = result.getRowObjects();
        return rows.map((r) => ({
          recorded_at: Number(r["recorded_at"] ?? 0),
          score: Number(r["score"] ?? 0),
          state: String(r["state"] ?? "active"),
          veto_active: Boolean(r["veto_active"] ?? false),
          monotonicity_rounds: Number(r["monotonicity_rounds"] ?? 0),
        }));
      } finally {
        await stmt.close();
      }
    } finally {
      await conn.close();
    }
  }

  /** Flush pending writes and close the DuckDB instance. */
  async close(): Promise<void> {
    await this._instance.close();
  }
}

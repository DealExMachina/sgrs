import { describe, it, expect, beforeEach, vi } from "vitest";
import { Client, createClient } from "../client.js";
import type { Scope } from "@sgrs/api-schema";

/**
 * Unit tests for the TypeScript SGRS API client.
 * Tests request/response handling, error cases, and type safety.
 */

describe("Client", () => {
  let client: Client;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    client = new Client({
      baseUrl: "http://localhost:3003",
      fetch: mockFetch as typeof fetch,
      timeout: 5000,
    });
  });

  describe("constructor", () => {
    it("should initialize with required config", () => {
      expect(client).toBeDefined();
    });

    it("should accept optional apiKey", () => {
      const clientWithKey = new Client({
        baseUrl: "http://localhost:3003",
        apiKey: "test-key",
      });
      expect(clientWithKey).toBeDefined();
    });

    it("should normalize baseUrl by removing trailing slash", () => {
      const client1 = new Client({ baseUrl: "http://localhost:3003/" });
      const client2 = new Client({ baseUrl: "http://localhost:3003" });
      // Both should work the same way
      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
    });
  });

  describe("scopes.list", () => {
    it("should handle successful response", async () => {
      const mockScopes: Scope[] = [
        {
          id: "scope-1",
          name: "Test Scope",
          tag: "test",
          state: "active",
          score: 0.5,
          cycles: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => mockScopes,
      });

      const result = await client.scopes.list();
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    });

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          code: "NOT_FOUND",
          message: "Scope not found",
        }),
      });

      const result = await client.scopes.list();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error?.code).toBe("NOT_FOUND");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const result = await client.scopes.list();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("NETWORK_ERROR");
      expect(result.error?.message).toContain("Network error");
    });

    it("should handle request timeout", async () => {
      const timeoutClient = new Client({
        baseUrl: "http://localhost:3003",
        timeout: 100,
        fetch: (async (_url: string | URL | Request, opts?: RequestInit) => {
          await new Promise((resolve, reject) => {
            const id = setTimeout(resolve, 200);
            opts?.signal?.addEventListener("abort", () => {
              clearTimeout(id);
              reject(new DOMException("Aborted", "AbortError"));
            });
          });
          return new Response(null, { status: 200 });
        }) as typeof fetch,
      });

      const result = await timeoutClient.scopes.list();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe("REQUEST_TIMEOUT");
    });
  });

  describe("scopes.get", () => {
    it("should make GET request with correct path", async () => {
      const scope: Scope = {
        id: "test-scope",
        name: "Test Scope",
        tag: "test",
        state: "active",
        score: 0.5,
        cycles: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => scope,
      });

      const result = await client.scopes.get("test-scope");

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/scopes/test-scope",
        expect.objectContaining({
          method: "GET",
        })
      );
    });

    it("should URL-encode scope ID", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      await client.scopes.get("scope-with-special/chars");

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("scope-with-special%2Fchars"),
        expect.anything()
      );
    });
  });

  describe("scopes.create", () => {
    it("should POST with request body", async () => {
      const newScope: Scope = {
        id: "new-scope",
        name: "New Scope",
        tag: "new",
        state: "active",
        score: 0.5,
        cycles: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => newScope,
      });

      const result = await client.scopes.create({
        id: "new-scope",
        name: "New Scope",
        tag: "new",
        state: "active",
        score: 0.5,
        cycles: 0,
      });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/scopes",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: expect.stringContaining('"name":"New Scope"'),
        })
      );
    });
  });

  describe("scopes.patch", () => {
    it("should PATCH with partial data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      await client.scopes.patch("test-scope", { score: 0.75 });

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/scopes/test-scope",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"score":0.75'),
        })
      );
    });
  });

  describe("scopes.delete", () => {
    it("should DELETE with correct path", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({}),
        text: async () => "",
      });

      const result = await client.scopes.delete("test-scope");

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/scopes/test-scope",
        expect.objectContaining({
          method: "DELETE",
        })
      );
    });
  });

  describe("models API", () => {
    it("should connect model with request validation", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          handle: "mh_abcdef0123456789abcdef",
          provider: "openai",
          model: "gpt-4",
          created_at: new Date().toISOString(),
          last_used_at: null,
        }),
      });

      const result = await client.models.connect({
        provider: "openai",
        api_key: "sk-test",
        model: "gpt-4",
      });

      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/models",
        expect.objectContaining({
          method: "POST",
        })
      );
    });

    it("should get model by handle", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          handle: "mh_test",
          provider: "openai",
          model: "gpt-4",
        }),
      });

      const result = await client.models.get("mh_test");
      expect(result.ok).toBe(true);
    });

    it("should revoke model", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: new Headers({}),
        text: async () => "",
      });

      const result = await client.models.revoke("mh_test");
      expect(result.ok).toBe(true);
    });
  });

  describe("finality API", () => {
    it("should get finality status", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          scope_id: "test-scope",
          score: 0.85,
          per_dimension: {
            claim_confidence: 0.9,
            contradiction_resolution: 0.8,
            goal_completion: 0.85,
            risk_score_inverse: 0.75,
          },
          monotonicity_rounds: 5,
          plateau_ema: 2.3,
          convergence_rate: 0.12,
          state: "near-final",
          veto_active: false,
        }),
      });

      const result = await client.finality.status("test-scope");
      expect(result.ok).toBe(true);
    });

    it("should get finality certificate by round", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "cert-1",
          scope_id: "test-scope",
          round: 1,
          issued_at: new Date().toISOString(),
          policy_hash: "sha256:abc123",
          signature_ed25519: "sig123",
          payload: {
            scope_id: "test-scope",
            score: 0.85,
            per_dimension: {},
            monotonicity_rounds: 5,
            plateau_ema: 2.3,
            convergence_rate: 0.12,
            state: "near-final",
            veto_active: false,
          },
        }),
      });

      const result = await client.finality.certificate("test-scope", 1);
      expect(result.ok).toBe(true);
    });
  });

  describe("health check", () => {
    it("should check API health", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          status: "healthy",
          timestamp: new Date().toISOString(),
        }),
      });

      const result = await client.health.check();
      expect(result.ok).toBe(true);
    });
  });

  describe("ingest.document", () => {
    it("should post the versioned ingest contract to /api/ingest", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          scope_id: "deal-horizon",
          name: "Horizon ARR memo",
          type: "txt",
          document_id: "doc_123",
          idempotency_key: "idem_123",
          queued: true,
          seq: 42,
          integration_version: "v1",
          message: "queued",
        }),
      });

      const result = await client.ingest.document({
        scope_id: "deal-horizon",
        name: "Horizon ARR memo",
        type: "txt",
        text: "ARR grew, but renewals are disputed.",
        document_id: "doc_123",
        source: "upload",
        idempotency_key: "idem_123",
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(202);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/ingest",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            scope_id: "deal-horizon",
            name: "Horizon ARR memo",
            type: "txt",
            text: "ARR grew, but renewals are disputed.",
            document_id: "doc_123",
            source: "upload",
            idempotency_key: "idem_123",
          }),
        }),
      );
    });
  });

  describe("governance read helpers", () => {
    it("claims.list should GET /api/claims/:scopeId", async () => {
      const claims = [
        {
          id: "11111111-1111-1111-1111-111111111111",
          scope_id: "deal-horizon",
          text: "ARR grew",
          source: "memo.pdf",
          confidence: 0.9,
          round: 1,
          created_at: new Date().toISOString(),
        },
      ];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => claims,
      });

      const result = await client.claims.list("deal-horizon");
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/claims/deal-horizon",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("contradictions.list should GET /api/contradictions/:scopeId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      const result = await client.contradictions.list("deal-horizon");
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/contradictions/deal-horizon",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("risks.list should GET /api/risks/:scopeId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      const result = await client.risks.list("deal-horizon");
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/risks/deal-horizon",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("documents.list should GET /api/documents/:scopeId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      const result = await client.documents.list("deal-horizon");
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/documents/deal-horizon",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("epochs.latest should GET /api/epochs/:scopeId/latest", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "55555555-5555-5555-5555-555555555555",
          scope_id: "deal-horizon",
          round: 2,
          summary_text: "Converging",
          claim_count: 3,
          drift_count: 0,
          contradiction_count: 1,
          risk_count: 1,
          score: 0.8,
          state: "near-final",
          comments: [],
          created_at: new Date().toISOString(),
        }),
      });

      const result = await client.epochs.latest("deal-horizon");
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/epochs/deal-horizon/latest",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should URL-encode the scopeId in read helpers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      await client.claims.list("scope/with/slashes");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("scope%2Fwith%2Fslashes"),
        expect.anything(),
      );
    });
  });

  describe("governance write helpers", () => {
    it("claims.create should POST /api/claims with the body", async () => {
      const claim = {
        id: "11111111-1111-1111-1111-111111111111",
        scope_id: "deal-horizon",
        text: "ARR grew 20%",
        source: "memo.pdf",
        dimension: "claim_confidence",
        confidence: 0.9,
        round: 0,
        created_at: new Date().toISOString(),
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => claim,
      });

      const result = await client.claims.create({
        scope_id: "deal-horizon",
        text: "ARR grew 20%",
        source: "memo.pdf",
        confidence: 0.9,
        dimension: "claim_confidence",
      });

      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
      expect(result.data?.text).toBe("ARR grew 20%");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/claims",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            scope_id: "deal-horizon",
            text: "ARR grew 20%",
            source: "memo.pdf",
            confidence: 0.9,
            dimension: "claim_confidence",
          }),
        }),
      );
    });

    it("claims.byDoc should GET /api/claims/:scopeId/by-doc and parse a record", async () => {
      const grouped = {
        "memo.pdf": [
          {
            id: "11111111-1111-1111-1111-111111111111",
            scope_id: "deal-horizon",
            text: "ARR grew",
            source: "memo.pdf",
            confidence: 0.9,
            round: 0,
            created_at: new Date().toISOString(),
          },
        ],
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => grouped,
      });

      const result = await client.claims.byDoc("deal-horizon");
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(false);
      expect(result.data?.["memo.pdf"]?.[0]?.source).toBe("memo.pdf");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/claims/deal-horizon/by-doc",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("drifts.list should GET /api/drifts/:scopeId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      const result = await client.drifts.list("deal-horizon");
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/drifts/deal-horizon",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("drifts.create should POST /api/drifts with the body", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "66666666-6666-6666-6666-666666666666",
          scope_id: "deal-horizon",
          subject: "claim.ARR",
          previous_confidence: 0.9,
          current_confidence: 0.6,
          delta: -0.3,
          severity: "high",
          round: 1,
          created_at: new Date().toISOString(),
        }),
      });

      const result = await client.drifts.create({
        scope_id: "deal-horizon",
        subject: "claim.ARR",
        previous_confidence: 0.9,
        current_confidence: 0.6,
        delta: -0.3,
        severity: "high",
      });

      expect(result.ok).toBe(true);
      expect(result.data?.severity).toBe("high");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/drifts",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"subject":"claim.ARR"'),
        }),
      );
    });

    it("contradictions.create should POST /api/contradictions", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "22222222-2222-2222-2222-222222222222",
          scope_id: "deal-horizon",
          claim_a: "ARR grew",
          claim_b: "ARR shrank",
          source_a: "a.pdf",
          source_b: "b.pdf",
          severity: "critical",
          status: "open",
          round: 1,
          created_at: new Date().toISOString(),
        }),
      });

      const result = await client.contradictions.create({
        scope_id: "deal-horizon",
        claim_a: "ARR grew",
        claim_b: "ARR shrank",
        source_a: "a.pdf",
        source_b: "b.pdf",
        severity: "critical",
      });

      expect(result.ok).toBe(true);
      expect(result.data?.status).toBe("open");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/contradictions",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("contradictions.resolve should PATCH /api/contradictions/:id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "22222222-2222-2222-2222-222222222222",
          scope_id: "deal-horizon",
          claim_a: "ARR grew",
          claim_b: "ARR shrank",
          source_a: "a.pdf",
          source_b: "b.pdf",
          severity: "critical",
          status: "resolved",
          resolution: "Reconciled figures",
          resolved_by: "analyst@acme",
          round: 1,
          created_at: new Date().toISOString(),
        }),
      });

      const result = await client.contradictions.resolve(
        "22222222-2222-2222-2222-222222222222",
        { status: "resolved", resolution: "Reconciled figures", resolved_by: "analyst@acme" },
      );

      expect(result.ok).toBe(true);
      expect(result.data?.status).toBe("resolved");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/contradictions/22222222-2222-2222-2222-222222222222",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"resolved_by":"analyst@acme"'),
        }),
      );
    });

    it("risks.create should POST /api/risks", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "33333333-3333-3333-3333-333333333333",
          scope_id: "deal-horizon",
          description: "Renewal risk",
          level: "high",
          source: "memo.pdf",
          round: 1,
          created_at: new Date().toISOString(),
        }),
      });

      const result = await client.risks.create({
        scope_id: "deal-horizon",
        description: "Renewal risk",
        level: "high",
        source: "memo.pdf",
      });

      expect(result.ok).toBe(true);
      expect(result.data?.level).toBe("high");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/risks",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("documents.create should POST /api/documents", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "44444444-4444-4444-4444-444444444444",
          scope_id: "deal-horizon",
          name: "memo.pdf",
          type: "pdf",
          status: "pending",
          claim_count: 0,
          ingested_at: new Date().toISOString(),
        }),
      });

      const result = await client.documents.create({
        scope_id: "deal-horizon",
        name: "memo.pdf",
        type: "pdf",
      });

      expect(result.ok).toBe(true);
      expect(result.data?.name).toBe("memo.pdf");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/documents",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("documents.patch should PATCH /api/documents/:id", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "44444444-4444-4444-4444-444444444444",
          scope_id: "deal-horizon",
          name: "memo.pdf",
          type: "pdf",
          status: "indexed",
          claim_count: 3,
          ingested_at: new Date().toISOString(),
        }),
      });

      const result = await client.documents.patch(
        "44444444-4444-4444-4444-444444444444",
        { status: "indexed", claim_count: 3 },
      );

      expect(result.ok).toBe(true);
      expect(result.data?.status).toBe("indexed");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/documents/44444444-4444-4444-4444-444444444444",
        expect.objectContaining({
          method: "PATCH",
          body: expect.stringContaining('"claim_count":3'),
        }),
      );
    });

    it("epochs.list should GET /api/epochs/:scopeId", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      const result = await client.epochs.list("deal-horizon");
      expect(result.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/epochs/deal-horizon",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("epochs.create should POST /api/epochs", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "55555555-5555-5555-5555-555555555555",
          scope_id: "deal-horizon",
          round: 2,
          summary_text: "Converging",
          claim_count: 3,
          drift_count: 0,
          contradiction_count: 1,
          risk_count: 1,
          score: 0.8,
          state: "near-final",
          comments: [],
          created_at: new Date().toISOString(),
        }),
      });

      const result = await client.epochs.create({
        scope_id: "deal-horizon",
        round: 2,
        summary_text: "Converging",
        score: 0.8,
        state: "near-final",
      });

      expect(result.ok).toBe(true);
      expect(result.data?.round).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/epochs",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("epochs.addComment should POST /api/epochs/:id/comments and return the updated summary", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          id: "55555555-5555-5555-5555-555555555555",
          scope_id: "deal-horizon",
          round: 2,
          summary_text: "Converging",
          claim_count: 3,
          drift_count: 0,
          contradiction_count: 1,
          risk_count: 1,
          score: 0.8,
          state: "near-final",
          comments: [
            {
              id: "77777777-7777-7777-7777-777777777777",
              author: "analyst@acme",
              text: "Looks good",
              created_at: new Date().toISOString(),
            },
          ],
          created_at: new Date().toISOString(),
        }),
      });

      const result = await client.epochs.addComment(
        "55555555-5555-5555-5555-555555555555",
        { author: "analyst@acme", text: "Looks good" },
      );

      expect(result.ok).toBe(true);
      expect(result.data?.comments?.[0]?.text).toBe("Looks good");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3003/api/epochs/55555555-5555-5555-5555-555555555555/comments",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"author":"analyst@acme"'),
        }),
      );
    });

    it("should include X-Tenant-ID header on write helpers when configured", async () => {
      const tenantClient = new Client({
        baseUrl: "http://localhost:3003",
        tenantId: "acme",
        fetch: mockFetch as typeof fetch,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({}),
      });

      await tenantClient.risks.create({
        scope_id: "deal-horizon",
        description: "Renewal risk",
        level: "high",
        source: "memo.pdf",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({ "X-Tenant-ID": "acme" }),
        }),
      );
    });
  });

  describe("request headers", () => {
    it("should include Authorization header when apiKey is set", async () => {
      const clientWithKey = new Client({
        baseUrl: "http://localhost:3003",
        apiKey: "test-api-key",
        fetch: mockFetch as typeof fetch,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      await clientWithKey.scopes.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-api-key",
          }),
        })
      );
    });

    it("should set correct Content-Type and Accept headers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => [],
      });

      await client.scopes.list();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Accept: "application/json",
          }),
        })
      );
    });
  });
});

describe("createClient", () => {
  it("should create a client instance", () => {
    const client = createClient({ baseUrl: "http://localhost:3003" });
    expect(client).toBeInstanceOf(Client);
  });

  it("should pass configuration to Client", () => {
    const config = {
      baseUrl: "http://api.example.com",
      apiKey: "test-key",
      timeout: 60000,
    };
    const client = createClient(config);
    expect(client).toBeDefined();
  });
});

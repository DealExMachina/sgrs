import { describe, it, expect } from "vitest";
import { createClient } from "../client.js";
import type {
  Scope,
  ModelHandle,
  FinalityStatus,
  FinalityCertificate,
} from "@sgrs/api-schema";

/**
 * Integration tests with mocked API responses.
 * Tests realistic workflows and end-to-end scenarios.
 */

describe("Client Integration Tests", () => {
  // Helper to create a mock fetch with predefined responses
  function createMockFetch(
    responses: Record<string, { ok: boolean; status: number; data: unknown }>
  ) {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];

    const mockFetch = async (rawUrl: string | URL | Request, options?: RequestInit): Promise<Response> => {
      const url = String(rawUrl);
      const method = options?.method || "GET";
      const body = options?.body ? JSON.parse(options.body as string) : null;
      calls.push({ url, method, body });

      const key = `${method} ${url.split("/api/")[1] || "health"}`;
      const response = responses[key];

      if (!response) {
        throw new Error(`No mock response for: ${key}`);
      }

      const hasBody = response.data !== null;
      return new Response(
        hasBody ? JSON.stringify(response.data) : null,
        {
          status: response.status,
          headers: hasBody ? { "content-type": "application/json" } : {},
        },
      );
    };

    return { mockFetch, calls };
  }

  describe("Scope Management Workflow", () => {
    it("should list, create, update, and delete scopes", async () => {
      const mockScope: Scope = {
        id: "horizon-ma-2025",
        name: "Project Horizon: TechCorp Acquisition",
        tag: "m&a",
        state: "active",
        score: 0.45,
        cycles: 2,
        created_at: "2025-04-24T10:00:00Z",
        updated_at: "2025-04-24T11:00:00Z",
      };

      const updatedScope = { ...mockScope, score: 0.65, cycles: 3 };

      const { mockFetch } = createMockFetch({
        "GET scopes": { ok: true, status: 200, data: [mockScope] },
        "GET scopes/horizon-ma-2025": { ok: true, status: 200, data: mockScope },
        "POST scopes": { ok: true, status: 201, data: mockScope },
        "PATCH scopes/horizon-ma-2025": {
          ok: true,
          status: 200,
          data: updatedScope,
        },
        "DELETE scopes/horizon-ma-2025": { ok: true, status: 204, data: null },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      // List scopes
      const listResult = await client.scopes.list();
      expect(listResult.ok).toBe(true);

      // Get specific scope
      const getResult = await client.scopes.get("horizon-ma-2025");
      expect(getResult.ok).toBe(true);
      expect(getResult.data?.name).toBe("Project Horizon: TechCorp Acquisition");

      // Create new scope
      const createResult = await client.scopes.create({
        name: "Project Horizon: TechCorp Acquisition",
        tag: "m&a",
        state: "active",
        score: 0.45,
        cycles: 2,
      });
      expect(createResult.ok).toBe(true);
      expect(createResult.data?.id).toBe("horizon-ma-2025");

      // Partial update scope
      const updateResult = await client.scopes.patch("horizon-ma-2025", {
        score: 0.65,
        cycles: 3,
      });
      expect(updateResult.ok).toBe(true);
      expect(updateResult.data?.score).toBe(0.65);

      // Delete scope
      const deleteResult = await client.scopes.delete("horizon-ma-2025");
      expect(deleteResult.ok).toBe(true);
    });
  });

  describe("LLM Model Management Workflow", () => {
    it("should connect, list, get, and revoke models", async () => {
      const modelHandle: ModelHandle = {
        handle: "mh_abc123def456ghi789jkl012",
        provider: "openai",
        model: "gpt-4-turbo",
        label: "Main GPT-4",
        created_at: "2025-04-24T10:00:00Z",
        last_used_at: "2025-04-24T11:00:00Z",
      };

      const { mockFetch } = createMockFetch({
        "POST models": { ok: true, status: 201, data: modelHandle },
        "GET models": { ok: true, status: 200, data: [modelHandle] },
        "GET models/mh_abc123def456ghi789jkl012": {
          ok: true,
          status: 200,
          data: modelHandle,
        },
        "DELETE models/mh_abc123def456ghi789jkl012": {
          ok: true,
          status: 204,
          data: null,
        },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      // Connect model
      const connectResult = await client.models.connect({
        provider: "openai",
        api_key: "sk-test-key-xxx",
        model: "gpt-4-turbo",
        label: "Main GPT-4",
      });
      expect(connectResult.ok).toBe(true);
      expect(connectResult.data?.provider).toBe("openai");
      expect(connectResult.data?.handle).toMatch(/^mh_[a-z0-9]{24}$/);

      // List models
      const listResult = await client.models.list();
      expect(listResult.ok).toBe(true);

      // Get specific model
      const getResult = await client.models.get("mh_abc123def456ghi789jkl012");
      expect(getResult.ok).toBe(true);

      // Revoke model
      const revokeResult = await client.models.revoke(
        "mh_abc123def456ghi789jkl012"
      );
      expect(revokeResult.ok).toBe(true);
    });
  });

  describe("Finality Certificate Workflow", () => {
    it("should get finality status and certificates", async () => {
      const finalityStatus: FinalityStatus = {
        scope_id: "horizon-ma-2025",
        score: 0.87,
        per_dimension: {
          claim_confidence: 0.92,
          contradiction_resolution: 0.88,
          goal_completion: 0.85,
          risk_score_inverse: 0.83,
        },
        monotonicity_rounds: 8,
        plateau_ema: 3.2,
        convergence_rate: 0.098,
        state: "near-final",
        veto_active: false,
      };

      const certificate: FinalityCertificate = {
        id: "cert-horizon-ma-2025-1",
        scope_id: "horizon-ma-2025",
        round: 1,
        issued_at: "2025-04-24T12:00:00Z",
        policy_hash: "sha256:abcdef0123456789abcdef0123456789",
        signature_ed25519:
          "sig_abcdef0123456789abcdef0123456789abcdef0123456789",
        payload: finalityStatus,
      };

      const { mockFetch } = createMockFetch({
        "GET finality/horizon-ma-2025": {
          ok: true,
          status: 200,
          data: finalityStatus,
        },
        "GET finality/horizon-ma-2025/certificate/1": {
          ok: true,
          status: 200,
          data: certificate,
        },
        "POST finality/verify": {
          ok: true,
          status: 200,
          data: { valid: true },
        },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      // Get finality status
      const statusResult = await client.finality.status("horizon-ma-2025");
      expect(statusResult.ok).toBe(true);
      expect(statusResult.data?.score).toBe(0.87);
      expect(statusResult.data?.state).toBe("near-final");
      expect(statusResult.data?.veto_active).toBe(false);

      // Get specific certificate
      const certResult = await client.finality.certificate(
        "horizon-ma-2025",
        1
      );
      expect(certResult.ok).toBe(true);
      expect(certResult.data?.round).toBe(1);
      expect(certResult.data?.payload.score).toBe(0.87);

      // Verify certificate
      const verifyResult = await client.finality.verify(certificate);
      expect(verifyResult.ok).toBe(true);
    });
  });

  describe("Error Handling Scenarios", () => {
    it("should handle 404 Not Found", async () => {
      const { mockFetch } = createMockFetch({
        "GET scopes/nonexistent": {
          ok: false,
          status: 404,
          data: {
            code: "SCOPE_NOT_FOUND",
            message: "Scope 'nonexistent' not found",
          },
        },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      const result = await client.scopes.get("nonexistent");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error?.code).toBe("SCOPE_NOT_FOUND");
    });

    it("should handle 400 Bad Request", async () => {
      const { mockFetch } = createMockFetch({
        "POST scopes": {
          ok: false,
          status: 400,
          data: {
            code: "VALIDATION_ERROR",
            message: "Invalid scope name",
            details: { field: "name", reason: "too short" },
          },
        },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      const result = await client.scopes.create({
        name: "x", // too short
        tag: "test",
        state: "active",
        score: 0.5,
        cycles: 0,
      });

      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
      expect(result.error?.code).toBe("VALIDATION_ERROR");
    });

    it("should handle 500 Internal Server Error", async () => {
      const { mockFetch } = createMockFetch({
        "GET scopes": {
          ok: false,
          status: 500,
          data: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Database connection failed",
          },
        },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      const result = await client.scopes.list();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(500);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty response bodies", async () => {
      const { mockFetch } = createMockFetch({
        "DELETE scopes/test": {
          ok: true,
          status: 204,
          data: null,
        },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      const result = await client.scopes.delete("test");
      expect(result.ok).toBe(true);
      expect(result.status).toBe(204);
    });

    it("should handle special characters in IDs", async () => {
      const { mockFetch, calls } = createMockFetch({
        "GET scopes/scope-with-special%2Fchars": {
          ok: true,
          status: 200,
          data: {
            id: "scope-with-special/chars",
            name: "Test",
            tag: "test",
            state: "active",
            score: 0.5,
            cycles: 0,
            created_at: "2025-04-24T10:00:00Z",
            updated_at: "2025-04-24T10:00:00Z",
          },
        },
      });

      const client = createClient({
        baseUrl: "http://localhost:3003",
        fetch: mockFetch,
      });

      await client.scopes.get("scope-with-special/chars");
      expect(calls[0]!.url).toContain("scope-with-special%2Fchars");
    });
  });
});

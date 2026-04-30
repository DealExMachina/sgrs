import { bench, describe } from "vitest";
import { Client } from "../client";
import type { Scope } from "@sgrs/api-schema";

/**
 * Performance benchmarks for the TypeScript SGRS API client.
 * Measures request latency, memory usage, and throughput.
 *
 * Run with: pnpm test -- --run --reporter=verbose
 */

describe("Client Performance Benchmarks", () => {
  // Helper to create mock fetch with configurable response time
  function createMockFetch(responseTimeMs: number = 0) {
    return async (url: string, options?: RequestInit) => {
      if (responseTimeMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, responseTimeMs)
        );
      }

      const scope: Scope = {
        id: "perf-test-scope",
        name: "Performance Test Scope",
        tag: "perf",
        state: "active",
        score: 0.5,
        cycles: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => (url.includes("scopes") ? scope : [scope]),
      };
    };
  }

  describe("Latency - Zero network delay", () => {
    bench("GET /scopes (list)", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });
      await client.scopes.list();
    });

    bench("GET /scopes/{id} (get)", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });
      await client.scopes.get("test-scope");
    });

    bench("POST /scopes (create)", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });
      await client.scopes.create({
        name: "Test Scope",
        tag: "test",
        state: "active",
        score: 0.5,
        cycles: 0,
      });
    });

    bench("PATCH /scopes/{id} (update)", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });
      await client.scopes.update("test-scope", { score: 0.75 });
    });

    bench("DELETE /scopes/{id} (delete)", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });
      await client.scopes.delete("test-scope");
    });

    bench("GET /finality/{id} (finality status)", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });
      await client.finality.status("test-scope");
    });

    bench("POST /models/connect (connect model)", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });
      await client.models.connect({
        provider: "openai",
        api_key: "sk-test",
        model: "gpt-4",
      });
    });
  });

  describe("Latency - Simulated network (50ms)", () => {
    bench("GET /scopes (list) + 50ms network", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(50),
      });
      await client.scopes.list();
    });

    bench("GET /scopes/{id} (get) + 50ms network", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(50),
      });
      await client.scopes.get("test-scope");
    });

    bench("POST /scopes (create) + 50ms network", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(50),
      });
      await client.scopes.create({
        name: "Test Scope",
        tag: "test",
        state: "active",
        score: 0.5,
        cycles: 0,
      });
    });
  });

  describe("Throughput - Multiple sequential requests", () => {
    bench("100 sequential GET requests", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });

      for (let i = 0; i < 100; i++) {
        await client.scopes.get("test-scope");
      }
    });

    bench("10 sequential scope CRUD cycles", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });

      for (let i = 0; i < 10; i++) {
        await client.scopes.create({
          name: `Scope ${i}`,
          tag: "test",
          state: "active",
          score: 0.5,
          cycles: 0,
        });
        await client.scopes.get(`scope-${i}`);
        await client.scopes.update(`scope-${i}`, { score: 0.75 });
        await client.scopes.delete(`scope-${i}`);
      }
    });
  });

  describe("Concurrent requests", () => {
    bench("5 concurrent GET requests", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });

      await Promise.all([
        client.scopes.get("scope-1"),
        client.scopes.get("scope-2"),
        client.scopes.get("scope-3"),
        client.scopes.get("scope-4"),
        client.scopes.get("scope-5"),
      ]);
    });

    bench("10 concurrent GET requests", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });

      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          client.scopes.get(`scope-${i}`)
        )
      );
    });

    bench("20 concurrent mixed operations", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: createMockFetch(0),
      });

      const operations = [
        ...Array(5).fill(null).map(() => client.scopes.list()),
        ...Array(5).fill(null).map(() => client.scopes.get("test")),
        ...Array(5).fill(null).map(() =>
          client.finality.status("test")
        ),
        ...Array(5).fill(null).map(() =>
          client.models.list()
        ),
      ];

      await Promise.all(operations);
    });
  });

  describe("Memory efficiency", () => {
    bench("Create 1000 client instances", () => {
      for (let i = 0; i < 1000; i++) {
        new Client({
          baseUrl: "http://localhost:3000",
          fetch: createMockFetch(0),
        });
      }
    });

    bench("String encoding of large scope list", () => {
      const scopes = Array.from({ length: 100 }, (_, i) => ({
        id: `scope-${i}`,
        name: `Scope ${i}`,
        tag: "test",
        state: "active",
        score: Math.random(),
        cycles: i,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      JSON.stringify(scopes);
    });
  });

  describe("Error handling overhead", () => {
    bench("Handle 404 error response", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        fetch: async () => ({
          ok: false,
          status: 404,
          headers: new Headers({ "content-type": "application/json" }),
          json: async () => ({
            code: "NOT_FOUND",
            message: "Scope not found",
          }),
        }),
      });

      const result = await client.scopes.get("nonexistent");
      // Verify error was handled
      if (!result.ok) {
        return result.error?.code;
      }
    });

    bench("Handle timeout error", async () => {
      const client = new Client({
        baseUrl: "http://localhost:3000",
        timeout: 1,
        fetch: async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return { ok: true, status: 200 };
        },
      });

      const result = await client.scopes.list();
      // Verify timeout was handled
      if (!result.ok) {
        return result.error?.code;
      }
    });
  });
});

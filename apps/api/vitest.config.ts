import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each test file gets its own isolated worker — prevents DB state bleed
    pool: "forks",
    // Vitest needs process.env for the encryption key
    env: {
      ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // 32 zero bytes, base64
      NODE_ENV: "test",
    },
    // Coverage reporting
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "json-summary", "html"],
      exclude: [
        "node_modules/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
      thresholds: {
        // Floor aligned with current API coverage (~58% lines); raise as routes gain tests.
        lines: 55,
        statements: 52,
        branches: 50,
        functions: 35,
      },
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Each test file gets its own isolated worker — prevents DB state bleed
    pool: "forks",
    poolOptions: {
      forks: { singleFork: false },
    },
    // Vitest needs process.env for the encryption key
    env: {
      ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // 32 zero bytes, base64
      NODE_ENV: "test",
    },
  },
});

import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  globalIgnores([".next/**", "node_modules/**", "next-env.d.ts"]),
  ...nextCoreWebVitals,
  {
    rules: {
      // Next 16 / react-hooks v7: SSE reconnect and scope bootstrap use effects by design.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "import/no-anonymous-default-export": "off",
    },
  },
]);

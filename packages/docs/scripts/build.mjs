/**
 * Builds static docs under ./dist:
 *   - api/index.html — OpenAPI rendered with Redoc (from @sgrs/api-schema)
 *   - spec/openapi.json — copy for downloads / tooling
 *   - client-ts/ — TypeDoc from @sgrs/client-ts
 *   - index.html — landing with links to the above + Python README pointer
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, "..");
const OPENAPI_SRC = resolve(PKG, "../api-schema/openapi.json");
const DIST = resolve(PKG, "dist");
const SPEC_OUT = resolve(DIST, "spec/openapi.json");
const API_HTML = resolve(DIST, "api", "index.html");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(resolve(DIST, "api"), { recursive: true });
mkdirSync(dirname(SPEC_OUT), { recursive: true });

copyFileSync(OPENAPI_SRC, SPEC_OUT);
console.log("[sgrs][docs] Copied openapi.json → dist/spec/openapi.json");

execFileSync("pnpm", ["exec", "redocly", "build-docs", OPENAPI_SRC, "-o", API_HTML], {
  cwd: PKG,
  stdio: "inherit",
});
console.log("[sgrs][docs] Redoc → dist/api/index.html");

execFileSync(
  "pnpm",
  ["exec", "typedoc", "--options", resolve(PKG, "typedoc.json")],
  {
    cwd: PKG,
    stdio: "inherit",
  },
);
console.log("[sgrs][docs] TypeDoc → dist/client-ts/");

const landing = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>SGRS — API & SDK documentation</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root { font-family: system-ui, sans-serif; line-height: 1.5; max-width: 42rem; margin: 3rem auto; padding: 0 1rem; color: #0f172a; }
    a { color: #0369a1; }
    h1 { font-size: 1.5rem; }
    ul { padding-left: 1.25rem; }
    code { background: #f1f5f9; padding: 0.1em 0.35em; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>SGRS documentation (generated)</h1>
  <p>Built from workspace sources. Run <code>pnpm docs</code> from the repo root to refresh.</p>
  <ul>
    <li><a href="./api/">REST API (OpenAPI, Redoc)</a></li>
    <li><a href="./spec/openapi.json">OpenAPI JSON</a></li>
    <li><a href="./client-ts/">TypeScript client (<code>@sgrs/client-ts</code>)</a></li>
  </ul>
  <p>Python client: run <code>pnpm docs:py</code> then open <code>packages/client-py/docs/_build/html/index.html</code> (Sphinx; see <code>packages/client-py/docs/</code>).</p>
</body>
</html>`;
writeFileSync(resolve(DIST, "index.html"), landing, "utf8");
console.log("[sgrs][docs] Wrote dist/index.html");

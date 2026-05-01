# @sgrs/docs

Aggregate **REST** and **TypeScript SDK** reference sites from canonical workspace sources:

| Artifact | Source | Generator |
|---------|--------|-----------|
| `dist/spec/openapi.json` | `@sgrs/api-schema/openapi.json` | copy |
| `dist/api/index.html` | same | [Redocly CLI](https://redocly.com/docs/cli/) |
| `dist/client-ts/` | `@sgrs/client-ts` | [TypeDoc](https://typedoc.org/) |
| `dist/index.html` | — | static landing |

## Usage

From the **repository root** (builds dependencies first via Turbo):

```bash
pnpm docs
```

Open `packages/docs/dist/index.html` in a browser, or serve the folder:

```bash
npx --yes serve packages/docs/dist
```

## CI

`docs` runs in GitHub Actions (OpenAPI + TypeDoc); **`docs-py`** runs separately (Python + Sphinx) mirroring that pattern.

## Python (`sgrs-client`)

Sphinx builds from `packages/client-py/docs/`. Locally:

```bash
pnpm docs:py
```

This runs `scripts/docs-py.sh`, which uses `packages/client-py/.venv` when needed.

Output: `packages/client-py/docs/_build/html/`. Dependencies: **`pip install 'sgrs-client[docs]'`** (extras defined in `pyproject.toml`).

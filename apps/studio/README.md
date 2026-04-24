# @sgrs/studio

Next.js 15 front-end for the SGRS product.

## Modes

- **Business** — graph + attention/progress/activity side panel
- **Configure** — governance, finality, agents, models, scopes, access
- **Debug** — graph + V(t) metrics + per-dim + governance trace + event stream

## BFF

Backend-for-Frontend routes live under `app/api/*`. The model provider keys
never reach the client bundle; they live server-side and are referenced by
opaque `model_handle` identifiers.

## Dev

```
pnpm dev
```

## License

BUSL-1.1 — see `LICENSE`.

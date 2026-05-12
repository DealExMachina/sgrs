import type { Context } from "hono";

let warnedLegacyControlPlaneUrl = false;

function controlPlaneBase(): string {
  const raw =
    process.env.KERNEL_CONTROL_PLANE_URL ??
    process.env.FEED_SERVER_URL ??
    "http://localhost:3002";
  if (
    process.env.KERNEL_CONTROL_PLANE_URL &&
    /:3006(?:\/|$)/.test(raw) &&
    !warnedLegacyControlPlaneUrl
  ) {
    warnedLegacyControlPlaneUrl = true;
    console.warn(
      "[sgrs][api] DEPRECATION: KERNEL_CONTROL_PLANE_URL pointing to port 3006 is deprecated. Route through FEED_SERVER_URL (/v1/* on feed) instead.",
    );
  }
  return raw.replace(/\/$/, "");
}

function feedBase(): string {
  return (process.env.FEED_SERVER_URL ?? "http://localhost:3002").replace(/\/$/, "");
}

function adminToken(): string {
  return (process.env.KERNEL_CONTROL_PLANE_ADMIN_TOKEN ?? process.env.SWARM_ADMIN_TOKEN ?? "").trim();
}

function copyResponse(upstream: Response): Response {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "connection" || k === "transfer-encoding" || k === "keep-alive") return;
    headers.set(key, value);
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function forward(
  c: Context,
  url: string,
  authToken: string | null,
): Promise<Response> {
  const headers = new Headers();
  headers.set("Accept", c.req.header("accept") ?? "application/json");
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);

  // Preserve tracing of original caller for auditability.
  const fwdFor = c.req.header("x-forwarded-for");
  if (fwdFor) headers.set("X-Forwarded-For", fwdFor);
  const realIp = c.req.header("x-real-ip");
  if (realIp) headers.set("X-Real-IP", realIp);

  const method = c.req.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    const raw = await c.req.arrayBuffer();
    body = raw.byteLength > 0 ? raw : undefined;
    if (body) {
      headers.set("Content-Type", c.req.header("content-type") ?? "application/json");
    }
  }

  const upstream = await fetch(url, {
    method,
    headers,
    body,
  }).catch((err: unknown) => {
    return c.json(
      {
        error: "Kernel upstream unavailable.",
        code: "PROXY_UPSTREAM_UNAVAILABLE",
        detail: err instanceof Error ? err.message : String(err),
        target: url,
      },
      502,
    );
  });
  return copyResponse(upstream as Response);
}

export async function proxyControlPlaneAsAdmin(c: Context, pathWithQuery: string): Promise<Response> {
  const token = adminToken();
  if (!token) {
    return c.json(
      {
        error: "Control plane admin token is not configured.",
        code: "CONTROL_PLANE_ADMIN_TOKEN_MISSING",
      },
      503,
    );
  }
  return forward(c, `${controlPlaneBase()}${pathWithQuery}`, token);
}

export async function proxyControlPlaneAsTenant(c: Context, pathWithQuery: string): Promise<Response> {
  const tenantApiKey = c.req.header("x-tenant-api-key")?.trim();
  if (!tenantApiKey) {
    return c.json(
      {
        error: "Missing X-Tenant-API-Key header for tenant-scoped control-plane operation.",
        code: "TENANT_API_KEY_MISSING",
      },
      400,
    );
  }
  return forward(c, `${controlPlaneBase()}${pathWithQuery}`, tenantApiKey);
}

export async function proxyFeed(c: Context, pathWithQuery: string): Promise<Response> {
  const token = process.env.SWARM_API_TOKEN?.trim() || null;
  return forward(c, `${feedBase()}${pathWithQuery}`, token);
}


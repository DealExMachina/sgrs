/**
 * Shared server-side headers for Studio → product API proxy routes.
 */

import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

const API_BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3003";
const DEFAULT_TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || "deal-ex-machina";

export { API_BACKEND, DEFAULT_TENANT_ID };

export async function backendProxyHeaders(
  request?: NextRequest,
  opts?: { tenantOverride?: string; projectId?: string },
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (process.env.CLERK_SECRET_KEY) {
    const { getToken } = await auth();
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  if (!headers.Authorization && request) {
    const incoming = request.headers.get("Authorization");
    if (incoming) headers.Authorization = incoming;
  }

  if (!headers.Authorization && process.env.NEXT_PUBLIC_API_KEY) {
    headers.Authorization = `Bearer ${process.env.NEXT_PUBLIC_API_KEY}`;
  }

  headers["X-Tenant-ID"] =
    request?.headers.get("X-Tenant-ID") ||
    opts?.tenantOverride ||
    DEFAULT_TENANT_ID;

  headers["X-Project-ID"] =
    request?.headers.get("X-Project-ID") ||
    opts?.projectId ||
    process.env.NEXT_PUBLIC_DEFAULT_PROJECT_ID ||
    "deal-ex-machina-default";

  return headers;
}

/**
 * Catch-all proxy for all /api/* routes to the backend API server (apps/api).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BACKEND, backendProxyHeaders } from "@/lib/backendProxy";

async function proxyRequest(
  request: NextRequest,
  slug: string[],
  method: string,
) {
  const pathString = slug.join("/");
  const query = request.nextUrl.searchParams.toString();
  const url = `${API_BACKEND}/api/${pathString}${query ? `?${query}` : ""}`;
  const headers = await backendProxyHeaders(request);

  const init: RequestInit = { method, headers };
  if (method !== "GET" && method !== "DELETE") {
    init.body = await request.text();
  }

  const response = await fetch(url, init);
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const { slug } = await params;
    return await proxyRequest(request, slug, "GET");
  } catch (error) {
    console.error("[studio][api/...slug] GET failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const { slug } = await params;
    return await proxyRequest(request, slug, "POST");
  } catch (error) {
    console.error("[studio][api/...slug] POST failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const { slug } = await params;
    return await proxyRequest(request, slug, "PUT");
  } catch (error) {
    console.error("[studio][api/...slug] PUT failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const { slug } = await params;
    return await proxyRequest(request, slug, "PATCH");
  } catch (error) {
    console.error("[studio][api/...slug] PATCH failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  try {
    const { slug } = await params;
    return await proxyRequest(request, slug, "DELETE");
  } catch (error) {
    console.error("[studio][api/...slug] DELETE failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

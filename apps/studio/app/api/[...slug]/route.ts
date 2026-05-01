/**
 * Catch-all proxy for all /api/* routes to the backend API server (apps/api).
 *
 * This routes handles:
 * - /api/claims/:scopeId
 * - /api/drifts/:scopeId
 * - /api/contradictions/:scopeId
 * - /api/risks/:scopeId
 * - /api/documents/:scopeId
 * - /api/finality/:scopeId
 * - /api/epochs/:scopeId/latest
 * - /api/models
 * - Any other backend endpoints
 *
 * Bridges the frontend (port 3001) and backend (port 3003), allowing both to run on different ports.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3003";
const DEFAULT_TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || "deal-ex-machina";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const pathString = slug.join("/");
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.toString();
    const url = `${API_BACKEND}/api/${pathString}${query ? `?${query}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-Tenant-ID": request.headers.get("X-Tenant-ID") || DEFAULT_TENANT_ID,
        "Authorization": request.headers.get("Authorization") || "",
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/...slug] GET failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const pathString = slug.join("/");
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.toString();
    const url = `${API_BACKEND}/api/${pathString}${query ? `?${query}` : ""}`;

    const body = await request.json();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Tenant-ID": request.headers.get("X-Tenant-ID") || DEFAULT_TENANT_ID,
        "Authorization": request.headers.get("Authorization") || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/...slug] POST failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const pathString = slug.join("/");
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.toString();
    const url = `${API_BACKEND}/api/${pathString}${query ? `?${query}` : ""}`;

    const body = await request.json();
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "X-Tenant-ID": request.headers.get("X-Tenant-ID") || DEFAULT_TENANT_ID,
        "Authorization": request.headers.get("Authorization") || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/...slug] PUT failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const pathString = slug.join("/");
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.toString();
    const url = `${API_BACKEND}/api/${pathString}${query ? `?${query}` : ""}`;

    const body = await request.json();
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "X-Tenant-ID": request.headers.get("X-Tenant-ID") || DEFAULT_TENANT_ID,
        "Authorization": request.headers.get("Authorization") || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/...slug] PATCH failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  try {
    const { slug } = await params;
    const pathString = slug.join("/");
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.toString();
    const url = `${API_BACKEND}/api/${pathString}${query ? `?${query}` : ""}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Tenant-ID": request.headers.get("X-Tenant-ID") || DEFAULT_TENANT_ID,
        "Authorization": request.headers.get("Authorization") || "",
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/...slug] DELETE failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 }
    );
  }
}

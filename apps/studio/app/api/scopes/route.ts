/**
 * Proxy /api/scopes to the backend API server (running on port 3003).
 *
 * Bridges the frontend and backend, allowing both to run on different ports.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_BACKEND = process.env.NEXT_PUBLIC_BACKEND_API_URL || "http://localhost:3003";
const DEFAULT_TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || "deal-ex-machina";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${API_BACKEND}/api/scopes`, {
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
    console.error("[studio][api/scopes] GET failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${API_BACKEND}/api/scopes`, {
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
    console.error("[studio][api/scopes] POST failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 }
    );
  }
}

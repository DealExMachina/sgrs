import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BACKEND, backendProxyHeaders } from "@/lib/backendProxy";

export async function GET(request: NextRequest) {
  try {
    const headers = await backendProxyHeaders(request);
    const response = await fetch(`${API_BACKEND}/api/keys`, { headers });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/keys] GET failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const headers = await backendProxyHeaders(request);
    const body = await request.json();
    const response = await fetch(`${API_BACKEND}/api/keys`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/keys] POST failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

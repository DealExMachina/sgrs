import { NextResponse } from "next/server";
import { API_BACKEND, backendProxyHeaders } from "@/lib/backendProxy";

export async function GET() {
  try {
    const headers = await backendProxyHeaders();
    const response = await fetch(`${API_BACKEND}/api/me`, { headers });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/me] GET failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

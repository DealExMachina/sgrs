import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BACKEND, backendProxyHeaders } from "@/lib/backendProxy";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const headers = await backendProxyHeaders(request);
    const response = await fetch(`${API_BACKEND}/api/keys/${id}`, {
      method: "DELETE",
      headers,
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[studio][api/keys/:id] DELETE failed:", error);
    return NextResponse.json(
      { error: "Backend API unreachable", code: "BACKEND_ERROR" },
      { status: 503 },
    );
  }
}

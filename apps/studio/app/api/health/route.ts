import { NextResponse } from "next/server";

/** BFF health check — placeholder until the real routes land. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "sgrs-studio-bff",
    timestamp: new Date().toISOString(),
  });
}

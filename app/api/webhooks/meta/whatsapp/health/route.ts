import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const token = process.env.WEBHOOK_HEALTH_TOKEN;
  // If token is configured, require callers to provide:
  // Authorization: Bearer <WEBHOOK_HEALTH_TOKEN>
  if (token) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${token}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      service: "meta-whatsapp-webhook-gateway",
    },
    { status: 200 },
  );
}

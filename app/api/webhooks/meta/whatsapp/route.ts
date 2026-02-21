import { NextRequest, NextResponse } from "next/server";

import { getLogger } from "@/lib/utils/logger";
import { rateLimiter } from "@/lib/utils/rate-limiter";
import {
  extractWebhookFields,
  forwardToTarget,
  getTargetsForFields,
  verifyMetaSignature,
} from "@/lib/webhooks/meta-whatsapp/forward";

export const runtime = "nodejs";

const log = getLogger("api:webhooks:meta:whatsapp");

type WhatsAppPayload = {
  object?: unknown;
};

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function GET(req: NextRequest) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const token = req.nextUrl.searchParams.get("hub.verify_token");

  if (
    mode === "subscribe" &&
    token &&
    verifyToken &&
    token === verifyToken &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!verifyMetaSignature(rawBody, signature)) {
    const badSigLimit = await rateLimiter.check(
      `meta-whatsapp:bad-sig:${ip}`,
      60,
      60_000,
    );
    if (!badSigLimit.success) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const validLimit = await rateLimiter.check(`meta-whatsapp:valid:${ip}`, 240, 60_000);
  if (!validLimit.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let payload: WhatsAppPayload;
  try {
    payload = JSON.parse(rawBody) as WhatsAppPayload;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (payload?.object !== "whatsapp_business_account") {
    return NextResponse.json({ error: "unsupported_object" }, { status: 422 });
  }

  const fields = extractWebhookFields(payload);
  const targets = getTargetsForFields(fields);
  if (targets.length === 0) {
    log.error("No forward destination configured", { fields });
    return NextResponse.json({ error: "destination_not_configured" }, { status: 500 });
  }

  const results = await Promise.allSettled(
    targets.map((target) => forwardToTarget(target, rawBody, signature)),
  );
  const failedTargets: string[] = [];
  results.forEach((result, index) => {
    if (result.status !== "rejected") return;
    const target = targets[index];
    if (!target) return;
    failedTargets.push(target.name);
  });

  if (failedTargets.length === 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  log.warn("Downstream forward failed", {
    fields,
    totalTargets: targets.length,
    failedTargets,
  });

  return NextResponse.json({ error: "downstream_unavailable" }, { status: 502 });
}

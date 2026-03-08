# WhatsApp Webhook Gateway Implementation Plan (Meta -> P2E Inferno -> Destination)

Last updated: February 20, 2026

## Goal

Create a stable, production-ready webhook gateway in the Next.js app so Meta always calls one endpoint you control, while you forward validated events to downstream destinations (n8n, Eliza, or any other service) without persisting webhook payload/user data in P2E Inferno.

## Meta Requirements To Implement (from docs)

Sources:
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint
- https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/

Key requirements from Meta docs:
- Webhook endpoint must accept `GET` (verification) and `POST` (events).
- Verification handshake:
  - Receive `hub.mode=subscribe`, `hub.challenge`, `hub.verify_token`.
  - Return HTTP `200` with raw `hub.challenge` only when verify token matches.
- POST security validation:
  - Validate `X-Hub-Signature-256` (`sha256=<hash>`).
  - Compute HMAC-SHA256 of the exact raw request body using your app secret.
  - Compare computed hash vs header hash.
- TLS/SSL certificate is required; self-signed certs are not supported.
- Payloads can be up to 3 MB.
- Batching can include many updates per request (Meta doc mentions up to 1000 updates).
- Retries happen on non-200 responses and can produce duplicates (docs mention 36 hours in one page and up to 7 days in overview); design deduplication for at least 7 days.
- Important: no historical webhook replay API guarantee for missed data; because this plan intentionally avoids payload storage in P2E Inferno, downstream systems must own persistence/replay needs.

## Recommended Architecture

1. Meta -> `POST /api/webhooks/meta/whatsapp`
2. Gateway verifies signature and shape, forwards event downstream, returns `200`
3. Gateway forwards raw payload to configured destination target(s)
4. Downstream systems do business logic (routing, automation, AI responses)
5. Outbound reply still uses WhatsApp Cloud API (or chosen provider)

## Why This Fits Your Goal

- Meta callback URL never changes.
- You can switch destination providers without touching Meta configuration.
- Security and routing stay centralized in P2E Inferno, while data retention is delegated to downstream systems.

## Acknowledgement Strategy (Important Tradeoff)

There are two valid acknowledgement models:

- `Sync-ack` (recommended for no-storage gateway): verify -> forward -> return `200` only if forward succeeds.
  - Pros: preserves at-least-once delivery without storing payload in gateway.
  - Cons: couples Meta retry behavior to downstream latency/availability.
- `Async-ack` (best-effort): verify -> return `200` immediately -> forward in `after(...)`.
  - Pros: decouples Meta retries from downstream slowness.
  - Cons: can lose events if forwarding fails because gateway stores nothing.

Given the no-storage requirement, this plan uses `sync-ack` by default.

## Implementation Phases

### Phase 1: Reference Implementation (Copy/Paste)

Implement exactly these files.

```ts
// lib/webhooks/meta-whatsapp/forward.ts
import crypto from "node:crypto";
import { getLogger } from "@/lib/utils/logger";

export type DestinationTarget = {
  name: string;
  url: string;
  secret?: string;
};

const log = getLogger("lib:webhooks:meta-whatsapp:forward");
let cachedRouteMap: Record<string, DestinationTarget[]> | null = null;
let routeMapInitialized = false;

export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return safeEqual(expected, signatureHeader);
}

function defaultTarget(): DestinationTarget[] {
  const defaultUrl = process.env.WHATSAPP_FORWARD_DESTINATION_URL;
  if (!defaultUrl) return [];
  return [
    {
      name: process.env.WHATSAPP_FORWARD_DESTINATION_NAME || "default",
      url: defaultUrl,
      secret: process.env.WHATSAPP_GATEWAY_SHARED_SECRET,
    },
  ];
}

export function extractWebhookFields(payload: any): string[] {
  const fields = new Set<string>();
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (typeof change?.field === "string" && change.field.length > 0) {
        fields.add(change.field);
      }
    }
  }
  return [...fields];
}

function getRouteMap(): Record<string, DestinationTarget[]> | null {
  if (routeMapInitialized) return cachedRouteMap;
  routeMapInitialized = true;

  const raw = process.env.WHATSAPP_FORWARD_ROUTE_MAP;
  if (!raw) return null;

  try {
    cachedRouteMap = JSON.parse(raw) as Record<string, DestinationTarget[]>;
    return cachedRouteMap;
  } catch {
    // Warning is emitted once per instance lifecycle.
    log.warn("Invalid WHATSAPP_FORWARD_ROUTE_MAP JSON; using default destination");
    return null;
  }
}

export function getTargetsForFields(fields: string[]): DestinationTarget[] {
  const defaults = defaultTarget();
  if (defaults.length === 0) return [];

  if (fields.length === 0) return defaults;
  const parsed = getRouteMap();
  if (!parsed) return defaults;

  const keyed = new Map<string, DestinationTarget>();
  for (const field of fields) {
    const fromMap = parsed[field];
    if (!Array.isArray(fromMap)) continue;
    for (const target of fromMap) {
      if (!target?.url) continue;
      const name = target.name || target.url;
      keyed.set(name, { name, url: target.url, secret: target.secret });
    }
  }
  if (keyed.size > 0) return [...keyed.values()];

  // Explicit behavior: fields not present in route map fall back to default target.
  return defaults;
}

export async function forwardToTarget(
  target: DestinationTarget,
  rawBody: string,
  metaSignature: string | null,
) {
  const timeoutMs = Number(process.env.WHATSAPP_FORWARD_TIMEOUT_MS || 3000);

  const resp = await fetch(target.url, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "content-type": "application/json",
      "x-source": "p2e-inferno-gateway",
      "x-destination-name": target.name,
      ...(target.secret ? { "x-gateway-secret": target.secret } : {}),
      ...(metaSignature ? { "x-meta-signature-256": metaSignature } : {}),
    },
    body: rawBody,
    cache: "no-store",
  });

  if (!resp.ok) {
    throw new Error(`forward_failed:${target.name}:${resp.status}`);
  }
}
```

```ts
// app/api/webhooks/meta/whatsapp/route.ts
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

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function GET(req: NextRequest) {
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const token = req.nextUrl.searchParams.get("hub.verify_token");

  if (mode === "subscribe" && token && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "verification_failed" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature)) {
    const badSigLimit = await rateLimiter.check(`meta-whatsapp:bad-sig:${ip}`, 60, 60_000);
    if (!badSigLimit.success) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const validLimit = await rateLimiter.check(`meta-whatsapp:valid:${ip}`, 240, 60_000);
  if (!validLimit.success) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
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

  // sync-ack model: only ack Meta after all target attempts
  const results = await Promise.allSettled(
    targets.map((target) => forwardToTarget(target, rawBody, signature)),
  );
  const failed = results
    .map((result, index) => ({ result, target: targets[index] }))
    .filter((x) => x.result.status === "rejected");

  if (failed.length === 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  log.warn("Downstream forward failed", {
    fields,
    totalTargets: targets.length,
    failedTargets: failed.map((f) => f.target.name),
  });
  return NextResponse.json({ error: "downstream_unavailable" }, { status: 502 });
}
```

```ts
// app/api/webhooks/meta/whatsapp/health/route.ts
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
```

Environment variables:

```bash
META_WEBHOOK_VERIFY_TOKEN=choose-a-long-random-token
META_APP_SECRET=your-meta-app-secret
WHATSAPP_FORWARD_DESTINATION_URL=https://your-destination.example/webhook
WHATSAPP_FORWARD_DESTINATION_NAME=destination-a
WHATSAPP_FORWARD_TIMEOUT_MS=5000
WHATSAPP_GATEWAY_SHARED_SECRET=internal-shared-secret
WHATSAPP_FORWARD_ROUTE_MAP='{"messages":[{"name":"agent","url":"https://example.com/inbox","secret":"shared"}],"message_template_status_update":[{"name":"ops","url":"https://example.com/status","secret":"shared"}]}'
WEBHOOK_HEALTH_TOKEN=optional-health-token
```

### Phase 2: Forwarding Semantics (Fixed)

Do not change these rules:
- Verify signature before forwarding.
- Never persist payload/user identifiers in gateway.
- Use sync-ack model by default (`200` only after forward success).
- Attempt all selected targets on each request; return `502` if any target fails.
- Forward raw body unchanged.
- For multi-target routing, downstream dedup is mandatory (retries can duplicate already-successful targets).
- Field-specific routing fallback is intentional:
  - If no payload fields match route-map entries, gateway forwards to default target.
  - If any payload field matches, gateway forwards the full raw payload only to matched targets (not additionally to default).

### Phase 3: Downstream Contract Setup

1. Configure destination endpoint to accept `POST` JSON.
2. Validate gateway origin via `x-gateway-secret` and `x-source`.
3. Add idempotency guard in destination using WhatsApp message/status IDs from payload.
4. Route by event type:
   - inbound messages -> agent/automation flow
   - statuses/account updates -> analytics/ops flow
5. Return 2xx quickly from destination to gateway.

Concrete destination idempotency contract:
- `messages` events: use `entry[].changes[].value.messages[].id`
- `statuses` events: use `entry[].changes[].value.statuses[].id`
- Other events without stable IDs: use SHA-256 of canonicalized `change` object
- Retention window for dedup keys: 7 days (matches worst-case retry horizon)

Concrete destination batch-handling contract:
- Treat incoming payload as a batch.
- Iterate all `entry[]` and all `changes[]`.
- Process each `change` independently with idempotency checks.
- Do not assume one webhook request equals one message event.

### Phase 4: Routing Modes (Implemented via `WHATSAPP_FORWARD_ROUTE_MAP`)

Routing is concrete and env-driven in `getTargetsForFields(fields)` in `lib/webhooks/meta-whatsapp/forward.ts`.
No pseudocode routing should be added by implementers.

## Operational Guardrails

- Verify app is in Live mode for production behavior.
- Subscribe only required webhook fields initially (`messages`, then others).
- Enforce request size limits >= 3 MB on your host/proxy.
- Add timeout for forwarding (short) and allow Meta retries on non-200.
- Log all verification failures and signature mismatches.
- Monitor duplicate rate and retry volume in destination system.
- Do not log webhook payload body in application logs.
- Add gateway health endpoint (optional): `GET /api/webhooks/meta/whatsapp/health`.
- Note on memory pressure: `req.text()` must read the body before signature validation, so rate limiting primarily protects forwarding cost, not request buffering cost. Control this at edge/proxy (request size limits, WAF, bot controls).

## Security Checklist

- `META_APP_SECRET` and verify token stored only in server env.
- Strict signature verification with timing-safe compare.
- HTTPS only endpoint with valid CA-signed certificate.
- Optional: enable mTLS (Meta-supported) for higher trust.
- Rate-limit by IP + signature failures.
- Avoid logging or storing sensitive message bodies in P2E Inferno.
- Destination services should trust gateway authenticity via internal shared secret header (`x-gateway-secret`) over private network ingress rules; do not share Meta app secret downstream unless explicitly required.
- Rate limiting is already implemented in the canonical `route.ts` reference above; do not add an alternate implementation path.

## Data Handling Policy (No Storage in Gateway)

- P2E Inferno webhook gateway stores no webhook payload/user identifiers.
- Processing is in-memory only for verification + forwarding.
- Any retention, dedup, replay, analytics, or audit storage happens in destination systems.

## Platform Size Limits

- Meta webhook payloads can be up to 3 MB.
- If deployed on Vercel Functions, current request/response body limit is 4.5 MB (sufficient for Meta payload ceiling).
- If using proxy features, check `experimental.proxyClientMaxBodySize` in Next.js config.
- If self-hosted, ensure reverse proxy/app server body size limits are >= 3 MB.

## Testing Plan

1. Verification test (GET)
- Simulate Meta challenge URL with correct token -> expect `200` + raw challenge.
- Wrong token -> expect `403`.

2. Signature test (POST)
- Signed payload with correct app secret -> `200`.
- Tampered body or bad signature -> `401`.

3. Shape/rate-limit tests
- Non-WhatsApp object payload -> `422`.
- Rate limit exceeded -> `429`.

4. Destination config tests
- No configured destination -> `500`.
- Malformed `WHATSAPP_FORWARD_ROUTE_MAP` JSON -> warning logged once per instance lifecycle; fallback to default destination.
- Valid route map with no matched fields -> fallback to default destination.
- Mixed-field payload where at least one field matches -> forward only to matched targets.

5. Forwarding tests
- Valid signed payload reaches configured destination with raw body unchanged.
- Multi-target where one target fails -> all targets attempted; gateway returns `502`.

6. Failure test
- Force destination 500/timeout and confirm gateway returns non-200 so Meta retries.

## Suggested Rollout Sequence

1. Deploy gateway endpoint with GET/POST verification only.
2. Configure Meta Callback URL + Verify token.
3. Subscribe to `messages` field first.
4. Enable destination forwarding (no payload storage in gateway).
5. Add dedup/persistence in destination if needed.
6. Add additional fields and secondary destinations after stability.

## Notes On Current Meta Docs Nuance

Current docs contain two retry-window statements:
- create-endpoint page references retries over ~36 hours.
- overview page references retries up to 7 days.

Implementation should assume worst-case duplicate/retry behavior (7 days) to stay safe.

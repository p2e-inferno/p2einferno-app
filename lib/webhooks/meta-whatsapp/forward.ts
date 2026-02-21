import crypto from "node:crypto";

import { getLogger } from "@/lib/utils/logger";

export type DestinationTarget = {
  name: string;
  url: string;
  secret?: string;
};

type RouteMap = Record<string, DestinationTarget[]>;
type WhatsAppChange = { field?: unknown };
type WhatsAppEntry = { changes?: unknown };
type WhatsAppPayload = { entry?: unknown };

const log = getLogger("lib:webhooks:meta-whatsapp:forward");

let cachedRouteMap: RouteMap | null = null;
let routeMapInitialized = false;

export function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret || !signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

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

function getRouteMap(): RouteMap | null {
  if (routeMapInitialized) return cachedRouteMap;
  routeMapInitialized = true;

  const raw = process.env.WHATSAPP_FORWARD_ROUTE_MAP;
  if (!raw) return null;

  try {
    cachedRouteMap = JSON.parse(raw) as RouteMap;
    return cachedRouteMap;
  } catch {
    // Warning is emitted once per instance lifecycle.
    log.warn("Invalid WHATSAPP_FORWARD_ROUTE_MAP JSON; using default destination");
    return null;
  }
}

export function extractWebhookFields(payload: unknown): string[] {
  const fields = new Set<string>();
  const p = payload as WhatsAppPayload;
  const entries = Array.isArray(p?.entry) ? (p.entry as WhatsAppEntry[]) : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes)
      ? (entry.changes as WhatsAppChange[])
      : [];
    for (const change of changes) {
      if (typeof change?.field === "string" && change.field.length > 0) {
        fields.add(change.field);
      }
    }
  }

  return [...fields];
}

export function getTargetsForFields(fields: string[]): DestinationTarget[] {
  const defaults = defaultTarget();
  if (fields.length === 0) return defaults;

  const parsed = getRouteMap();
  if (parsed) {
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
  }

  // Explicit behavior: fields not present in route map fall back to default target.
  if (defaults.length > 0) return defaults;
  return [];
}

export async function forwardToTarget(
  target: DestinationTarget,
  rawBody: string,
  metaSignature: string | null,
): Promise<void> {
  const parsedTimeoutMs = Number(process.env.WHATSAPP_FORWARD_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(parsedTimeoutMs) && parsedTimeoutMs > 0
      ? parsedTimeoutMs
      : 3000;

  const response = await fetch(target.url, {
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

  if (!response.ok) {
    throw new Error(`forward_failed:${target.name}:${response.status}`);
  }
}

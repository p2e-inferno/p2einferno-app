import crypto from "crypto";

import { NextApiRequest, NextApiResponse } from "next";

import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:meta-data-deletion");

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const EXPECTED_SIGNED_REQUEST_ALGORITHM = "HMAC-SHA256";
const USER_ID_FINGERPRINT_LENGTH = 12;
const MASKED_CODE_VISIBLE_CHARS = 4;
const MASKED_CODE_MIN_LENGTH = 8;

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientKey(req: NextApiRequest): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ipFromForwarded =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",")[0]?.trim()
      : Array.isArray(forwardedFor)
        ? forwardedFor[0]?.split(",")[0]?.trim()
        : undefined;
  const ip = ipFromForwarded || req.socket.remoteAddress || "unknown";
  return ip;
}

function cleanupExpiredRateLimitEntries(now: number): void {
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function isRateLimited(req: NextApiRequest): boolean {
  const now = Date.now();
  cleanupExpiredRateLimitEntries(now);
  const key = getClientKey(req);
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  current.count += 1;
  rateLimitStore.set(key, current);
  return false;
}

function maskCode(value: string): string {
  if (value.length <= MASKED_CODE_MIN_LENGTH) return "****";
  return `${value.slice(0, MASKED_CODE_VISIBLE_CHARS)}...${value.slice(-MASKED_CODE_VISIBLE_CHARS)}`;
}

function base64UrlDecode(input: string): Buffer {
  // Convert base64url to standard base64
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

function parseSignedRequest(
  signedRequest: string,
  appSecret: string,
): { user_id: string } | null {
  try {
    const [encodedSig, payload] = signedRequest.split(".", 2);

    if (!encodedSig || !payload) {
      log.error("Invalid signed_request format");
      return null;
    }

    const sig = base64UrlDecode(encodedSig);
    const expectedSig = crypto
      .createHmac("sha256", appSecret)
      .update(payload)
      .digest();

    if (sig.length !== expectedSig.length) {
      log.error("Bad signed_request signature length");
      return null;
    }

    if (!crypto.timingSafeEqual(sig, expectedSig)) {
      log.error("Bad signed_request signature");
      return null;
    }

    const data = JSON.parse(base64UrlDecode(payload).toString("utf-8"));
    if (
      !data ||
      typeof data.user_id !== "string" ||
      data.user_id.length === 0
    ) {
      log.error("signed_request payload missing user_id");
      return null;
    }

    if (
      typeof data.algorithm !== "string" ||
      data.algorithm !== EXPECTED_SIGNED_REQUEST_ALGORITHM
    ) {
      log.error("signed_request payload invalid algorithm");
      return null;
    }

    return { user_id: data.user_id };
  } catch (error) {
    log.error("Failed to parse signed_request", { error });
    return null;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (isRateLimited(req)) {
    log.warn("Meta deletion callback rate limited");
    return res.status(429).json({ error: "Too many requests" });
  }

  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    log.error("META_APP_SECRET is not configured");
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Next.js usually parses req.body as an object for JSON and form-urlencoded
  // requests. This signedRequest IIFE only handles string req.body as a
  // defensive fallback when body parsing is disabled or Content-Type is unknown.
  const signedRequest = (() => {
    if (typeof req.body === "string") {
      try {
        const parsed = JSON.parse(req.body);
        if (typeof parsed?.signed_request === "string") {
          return parsed.signed_request;
        }
      } catch {
        const params = new URLSearchParams(req.body);
        const formValue = params.get("signed_request");
        if (formValue) return formValue;
      }
      return undefined;
    }
    return req.body?.signed_request;
  })();
  if (!signedRequest || typeof signedRequest !== "string") {
    return res.status(400).json({ error: "Missing signed_request" });
  }

  const data = parseSignedRequest(signedRequest, appSecret);
  if (!data) {
    return res.status(403).json({ error: "Invalid signed request" });
  }

  const confirmationCode = crypto.randomUUID();
  const userIdFingerprint = crypto
    .createHmac("sha256", appSecret)
    .update(data.user_id)
    .digest("hex")
    .slice(0, USER_ID_FINGERPRINT_LENGTH);

  log.info("Data deletion request received", {
    userIdFingerprint,
    confirmationCodeMasked: maskCode(confirmationCode),
  });

  // This app does not store any Facebook user data.
  // Acknowledge the request per Meta's requirements.
  // confirmation_code is a receipt token only and is not persisted.
  const appBaseUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://p2einferno.com"
  ).replace(/\/+$/, "");

  return res.status(200).json({
    url: `${appBaseUrl}/deletion-status?id=${encodeURIComponent(confirmationCode)}`,
    confirmation_code: confirmationCode,
  });
}

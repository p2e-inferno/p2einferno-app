import crypto from "crypto";

import { NextApiRequest, NextApiResponse } from "next";

import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:meta-data-deletion");

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
    return res.status(405).json({ error: "Method not allowed" });
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
    .slice(0, 12);

  log.info("Data deletion request received", {
    userIdFingerprint,
    confirmationCode,
  });

  // This app does not store any Facebook user data.
  // Acknowledge the request per Meta's requirements.
  const appBaseUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "https://p2einferno.com"
  ).replace(/\/+$/, "");

  return res.status(200).json({
    url: `${appBaseUrl}/deletion-status?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

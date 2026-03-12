import { NextRequest, NextResponse } from "next/server";
import {
  chatRouteBadRequest,
  parseChatRouteJson,
  resolveOptionalChatRouteUser,
} from "@/lib/chat/server/route-helpers";
import {
  enforceChatRespondBurstLimit,
  enforceChatRespondQuotaLimit,
  getChatAnonymousSessionCookieName,
  resolveChatRespondUsageIdentity,
} from "@/lib/chat/server/respond-rate-limit";
import { hasActiveChatMembership } from "@/lib/chat/server/respond-membership";
import {
  generateChatResponse,
  validateChatRespondBody,
} from "@/lib/chat/server/respond-service";
import type { ChatRespondRequestBody } from "@/lib/chat/server/respond-types";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:chat-respond");

function applyAnonymousSessionCookie(
  response: NextResponse,
  anonymousSessionId?: string,
) {
  if (!anonymousSessionId) {
    return response;
  }

  response.cookies.set(
    getChatAnonymousSessionCookieName(),
    anonymousSessionId,
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  );

  return response;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await resolveOptionalChatRouteUser(req);
    const parsed = await parseChatRouteJson<ChatRespondRequestBody>(req);
    if (parsed.response || !parsed.body) {
      return parsed.response;
    }

    const validationError = validateChatRespondBody(parsed.body);
    if (validationError) {
      return chatRouteBadRequest(validationError);
    }

    const usageIdentity = resolveChatRespondUsageIdentity(
      req,
      auth.user?.id ?? null,
    );

    let hasMembership = false;
    if (auth.user) {
      // Membership is resolved before burst enforcement so member traffic can
      // reach the higher burst tier on routes that use it. On a cold cache this
      // means one membership lookup may happen before we reject an authenticated
      // burst-limited request. That is a known pragmatic trade-off in the
      // current single-route implementation.
      try {
        hasMembership = await hasActiveChatMembership(auth.user.id);
      } catch {
        hasMembership = false;
      }
    }

    const burst = enforceChatRespondBurstLimit({
      identity: usageIdentity,
      hasMembership,
    });

    if (!burst.allowed) {
      const response = NextResponse.json(
        {
          error: burst.error ?? "Too many requests",
          reason: burst.reason ?? "burst",
        },
        {
          status: burst.status ?? 429,
          headers: burst.retryAfterSeconds
            ? { "Retry-After": `${burst.retryAfterSeconds}` }
            : undefined,
        },
      );
      return applyAnonymousSessionCookie(response, burst.anonymousSessionId);
    }

    const quota = enforceChatRespondQuotaLimit({
      identity: usageIdentity,
      hasMembership,
    });

    if (!quota.allowed) {
      const response = NextResponse.json(
        {
          error: quota.error ?? "Too many requests",
          reason: quota.reason ?? "quota",
        },
        {
          status: quota.status ?? 429,
          headers: quota.retryAfterSeconds
            ? { "Retry-After": `${quota.retryAfterSeconds}` }
            : undefined,
        },
      );
      return applyAnonymousSessionCookie(
        response,
        quota.anonymousSessionId ?? burst.anonymousSessionId,
      );
    }

    const payload = await generateChatResponse({
      body: parsed.body,
      isAuthenticated: Boolean(auth.user),
    });

    const response = NextResponse.json(payload);
    return applyAnonymousSessionCookie(
      response,
      burst.anonymousSessionId ?? quota.anonymousSessionId,
    );
  } catch (error) {
    log.error("Failed to generate chat response", { error });
    return NextResponse.json(
      { error: "Unable to generate chat response" },
      { status: 500 },
    );
  }
}

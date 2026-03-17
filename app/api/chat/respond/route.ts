import { NextRequest, NextResponse } from "next/server";
import {
  chatRouteBadRequest,
  parseChatRouteJson,
  resolveOptionalChatRouteUser,
} from "@/lib/chat/server/route-helpers";
import { ChatAttachmentAccessError } from "@/lib/chat/server/attachment-access";
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
      log.warn("Rejected chat respond request during validation", {
        isAuthenticated: Boolean(auth.user),
        validationError,
        conversationId: parsed.body.conversationId,
        pathname: parsed.body.route?.pathname,
        routeKey: parsed.body.route?.routeKey,
      });
      return chatRouteBadRequest(validationError);
    }

    log.debug("Accepted chat respond request", {
      isAuthenticated: Boolean(auth.user),
      userId: auth.user?.id ?? null,
      conversationId: parsed.body.conversationId,
      pathname: parsed.body.route.pathname,
      routeKey: parsed.body.route.routeKey,
      behaviorKey: parsed.body.route.behaviorKey ?? null,
      segment: parsed.body.route.segment ?? null,
      messageLength: parsed.body.message.length,
      attachmentCount: parsed.body.attachments?.length ?? 0,
      historyCount: parsed.body.messages.length,
    });

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

    const burst = await enforceChatRespondBurstLimit({
      identity: usageIdentity,
      hasMembership,
    });

    if (!burst.allowed) {
      log.warn("Blocked chat respond request by burst limit", {
        conversationId: parsed.body.conversationId,
        pathname: parsed.body.route.pathname,
        hasMembership,
        reason: burst.reason ?? "burst",
        status: burst.status ?? 429,
      });
      const response = NextResponse.json(
        {
          error: burst.error ?? "Too many requests",
          reason: burst.reason ?? "burst",
          tier: burst.tier,
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

    const quota = await enforceChatRespondQuotaLimit({
      identity: usageIdentity,
      hasMembership,
    });

    if (!quota.allowed) {
      log.warn("Blocked chat respond request by quota limit", {
        conversationId: parsed.body.conversationId,
        pathname: parsed.body.route.pathname,
        hasMembership,
        reason: quota.reason ?? "quota",
        status: quota.status ?? 429,
      });
      const response = NextResponse.json(
        {
          error: quota.error ?? "Too many requests",
          reason: quota.reason ?? "quota",
          tier: quota.tier,
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
      attachmentOwnerIdentityKey: usageIdentity.identityKey,
    });

    log.debug("Completed chat respond request", {
      conversationId: parsed.body.conversationId,
      pathname: parsed.body.route.pathname,
      responseMessageId: payload.message.id,
      responseLength: payload.message.content.length,
      sourceCount: payload.sources.length,
      retrievalMeta: payload.retrievalMeta ?? null,
    });

    const response = NextResponse.json(payload);
    return applyAnonymousSessionCookie(
      response,
      burst.anonymousSessionId ?? quota.anonymousSessionId,
    );
  } catch (error) {
    if (error instanceof ChatAttachmentAccessError) {
      return NextResponse.json(
        { error: "One or more attachments could not be accessed" },
        { status: 403 },
      );
    }

    log.error("Failed to generate chat response", { error });
    return NextResponse.json(
      { error: "Unable to generate chat response" },
      { status: 500 },
    );
  }
}

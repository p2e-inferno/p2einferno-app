import { del } from "@vercel/blob";
import type { NextRequest, NextResponse } from "next/server";
import { isChatAttachmentBlobPath } from "@/lib/chat/attachment-serving";
import { resolveOptionalChatRouteUser } from "@/lib/chat/server/route-helpers";
import {
  enforceChatAttachmentUploadBurstLimit,
  enforceChatAttachmentUploadQuotaLimit,
  getChatAnonymousSessionCookieName,
  resolveChatRespondUsageIdentity,
  type ChatRespondUsageIdentity,
} from "@/lib/chat/server/respond-rate-limit";
import { hasActiveChatMembership } from "@/lib/chat/server/respond-membership";
import { createAdminClient } from "@/lib/supabase/server";

export class ChatAttachmentAccessError extends Error {
  constructor(message = "Attachment access denied") {
    super(message);
    this.name = "ChatAttachmentAccessError";
  }
}

export interface ChatAttachmentAccessIdentity {
  authUserId: string | null;
  usageIdentity: ChatRespondUsageIdentity;
  hasMembership: boolean;
}

interface PersistOwnershipParams {
  pathname: string;
  identity: ChatAttachmentAccessIdentity;
}

interface OwnershipRecord {
  owner_identity_key: string;
  status: "pending" | "uploaded";
}

interface OwnershipClaimRecord extends OwnershipRecord {
  pathname: string;
}

function getRequestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return request.nextUrl.origin;
}

export function applyChatAnonymousSessionCookie(
  response: NextResponse,
  identity: ChatAttachmentAccessIdentity,
) {
  if (!identity.usageIdentity.shouldSetAnonymousCookie) {
    return response;
  }

  const anonymousSessionId = identity.usageIdentity.anonymousSessionId;
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

export function isTrustedChatAttachmentOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  return origin === getRequestOrigin(request);
}

export async function resolveChatAttachmentAccessIdentity(
  request: NextRequest,
): Promise<ChatAttachmentAccessIdentity> {
  const auth = await resolveOptionalChatRouteUser(request);
  const usageIdentity = resolveChatRespondUsageIdentity(
    request,
    auth.user?.id ?? null,
  );

  let hasMembership = false;
  if (auth.user?.id) {
    try {
      hasMembership = await hasActiveChatMembership(auth.user.id);
    } catch {
      hasMembership = false;
    }
  }

  return {
    authUserId: auth.user?.id ?? null,
    usageIdentity,
    hasMembership,
  };
}

export async function enforceChatAttachmentUploadLimits(
  identity: ChatAttachmentAccessIdentity,
) {
  const burst = await enforceChatAttachmentUploadBurstLimit({
    identity: identity.usageIdentity,
    hasMembership: identity.hasMembership,
  });

  if (!burst.allowed) {
    return burst;
  }

  return enforceChatAttachmentUploadQuotaLimit({
    identity: identity.usageIdentity,
    hasMembership: identity.hasMembership,
  });
}

export async function persistChatAttachmentOwnership({
  pathname,
  identity,
}: PersistOwnershipParams) {
  const supabase = createAdminClient();
  const claimPayload = {
    pathname,
    owner_identity_key: identity.usageIdentity.identityKey,
    privy_user_id: identity.authUserId,
    anonymous_session_id: identity.usageIdentity.anonymousSessionId ?? null,
    source_ip: identity.usageIdentity.ip,
    status: "pending" as const,
    uploaded_at: null,
  };

  const { error } = await supabase
    .from("chat_attachment_uploads")
    .insert(claimPayload);

  if (!error) {
    return;
  }

  if (error.code !== "23505") {
    throw new Error(`Unable to persist chat attachment ownership: ${error.message}`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("chat_attachment_uploads")
    .select("pathname, owner_identity_key, status")
    .eq("pathname", pathname)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      `Unable to verify existing chat attachment ownership: ${existingError.message}`,
    );
  }

  const existingRecord = existing as OwnershipClaimRecord | null;
  if (!existingRecord) {
    throw new Error("Existing chat attachment ownership record not found");
  }

  if (existingRecord.owner_identity_key !== identity.usageIdentity.identityKey) {
    throw new ChatAttachmentAccessError("Attachment pathname is already claimed");
  }
}

export async function markChatAttachmentUploaded(pathname: string) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("chat_attachment_uploads")
    .update({
      status: "uploaded",
      uploaded_at: new Date().toISOString(),
    })
    .eq("pathname", pathname);

  if (error) {
    throw new Error(`Unable to mark chat attachment uploaded: ${error.message}`);
  }
}

export async function assertChatAttachmentOwnership(
  pathname: string,
  identityKey: string,
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("chat_attachment_uploads")
    .select("owner_identity_key, status")
    .eq("pathname", pathname)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to verify chat attachment ownership: ${error.message}`);
  }

  const record = data as OwnershipRecord | null;

  if (!record || record.owner_identity_key !== identityKey) {
    throw new ChatAttachmentAccessError();
  }

  return record;
}

export async function deleteChatAttachmentOwnershipRecords(pathnames: string[]) {
  if (!pathnames.length) {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("chat_attachment_uploads")
    .delete()
    .in("pathname", pathnames);

  if (error) {
    throw new Error(
      `Unable to delete chat attachment ownership records: ${error.message}`,
    );
  }
}

export async function deleteChatAttachments(pathnames: string[]) {
  const uniquePathnames = Array.from(
    new Set(pathnames.filter((pathname) => isChatAttachmentBlobPath(pathname))),
  );

  if (!uniquePathnames.length) {
    return;
  }

  await del(uniquePathnames);
}

export async function deleteChatAttachmentsWithOwnershipCleanup(
  pathnames: string[],
) {
  await deleteChatAttachments(pathnames);
  await deleteChatAttachmentOwnershipRecords(pathnames);
}

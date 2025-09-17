import { getLogger } from "@/lib/utils/logger";

const log = getLogger("auth:ownership");

export interface OwnershipResult {
  ok: boolean;
  reason?: string;
}

/**
 * Verifies that the authenticated user (from Privy claims) owns the application.
 * Minimal, non-breaking checks using either privy_user_id match or email fallback.
 */
export async function assertApplicationOwnership(
  supabase: any,
  applicationId: string,
  claims: any,
): Promise<OwnershipResult> {
  try {
    const claimsUserId = (claims?.userId || claims?.sub || "").toString();
    if (!claimsUserId) {
      return { ok: false, reason: "Missing user identity in claims" };
    }

    // Fetch application with minimal fields
    const { data: app, error: appErr } = await supabase
      .from("applications")
      .select("id, user_profile_id, user_email")
      .eq("id", applicationId)
      .maybeSingle();

    if (appErr || !app) {
      return { ok: false, reason: "Application not found" };
    }

    // Resolve user profile by privy_user_id
    const { data: profile, error: profErr } = await supabase
      .from("user_profiles")
      .select("id, email, privy_user_id")
      .eq("privy_user_id", claimsUserId)
      .maybeSingle();

    if (profErr || !profile) {
      // Fallback: if profile not found, try email match if both present
      if (app.user_email) {
        const { data: profileByEmail } = await supabase
          .from("user_profiles")
          .select("id, email")
          .eq("email", app.user_email)
          .maybeSingle();
        if (profileByEmail && profileByEmail.id === app.user_profile_id) {
          return { ok: true };
        }
      }
      return { ok: false, reason: "User profile not found for claims" };
    }

    // Primary check: profile.id matches application.user_profile_id
    if (profile.id && app.user_profile_id && profile.id === app.user_profile_id) {
      return { ok: true };
    }

    // Fallback: email match if present
    if (profile.email && app.user_email && profile.email === app.user_email) {
      return { ok: true };
    }

    return { ok: false, reason: "Ownership mismatch" };
  } catch (e: any) {
    log.error("Ownership check error", { error: e?.message });
    return { ok: false, reason: "Ownership check error" };
  }
}


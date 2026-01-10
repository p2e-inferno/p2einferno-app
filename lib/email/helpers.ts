import { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "./mailgun";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("email:helpers");

export interface PaymentEmailContext {
  email: string;
  cohortName: string;
  amount?: number;
  currency?: string;
}

/**
 * Fetch email context for payment-related emails.
 * Returns null if user email is missing or invalid.
 */
export async function getPaymentEmailContext(
  supabase: SupabaseClient,
  applicationId: string,
): Promise<PaymentEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("applications")
      .select("user_email, cohort:cohort_id ( name )")
      .eq("id", applicationId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch payment email context", { applicationId, error });
      return null;
    }

    const email = normalizeEmail(data.user_email);
    if (!email) {
      log.warn("No valid email for application", { applicationId });
      return null;
    }

    const cohort = Array.isArray(data.cohort) ? data.cohort[0] : data.cohort;

    return {
      email,
      cohortName: cohort?.name || "Bootcamp",
    };
  } catch (err) {
    log.error("Exception fetching payment email context", { applicationId, err });
    return null;
  }
}

export interface UserEmailContext {
  email: string;
  displayName?: string;
}

/**
 * Fetch user email from profile by privy_user_id.
 */
export async function getUserEmailContext(
  supabase: SupabaseClient,
  privyUserId: string,
): Promise<UserEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("email, display_name")
      .eq("privy_user_id", privyUserId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch user email context", { privyUserId, error });
      return null;
    }

    const email = normalizeEmail(data.email);
    if (!email) return null;

    return {
      email,
      displayName: data.display_name,
    };
  } catch (err) {
    log.error("Exception fetching user email context", { privyUserId, err });
    return null;
  }
}

/**
 * Fetch user email from profile by user_profile_id (UUID).
 */
export async function getUserEmailContextById(
  supabase: SupabaseClient,
  userProfileId: string,
): Promise<UserEmailContext | null> {
  try {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("email, display_name")
      .eq("id", userProfileId)
      .single();

    if (error || !data) {
      log.warn("Failed to fetch user email by profile ID", { userProfileId, error });
      return null;
    }

    const email = normalizeEmail(data.email);
    if (!email) return null;

    return {
      email,
      displayName: data.display_name,
    };
  } catch (err) {
    log.error("Exception fetching user email by profile ID", { userProfileId, err });
    return null;
  }
}

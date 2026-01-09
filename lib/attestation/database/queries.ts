/**
 * Database query utilities for attestations
 */

import { supabase } from "@/lib/supabase";
import { getLogger } from "@/lib/utils/logger";
import { Attestation } from "../core/types";

const log = getLogger("lib:attestation:database");

const getDefaultNetworkName = (): string =>
  process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || "base-sepolia";

/**
 * Get attestations for a specific user
 */
export const getUserAttestations = async (
  userAddress: string,
  options?: {
    schemaUid?: string;
    category?: string;
    limit?: number;
    offset?: number;
    network?: string;
  },
): Promise<Attestation[]> => {
  try {
    const resolvedNetwork = options?.network || getDefaultNetworkName();
    let query = supabase
      .from("attestations")
      .select(
        `
        *,
        attestation_schemas (
          name,
          description,
          category
        )
      `,
      )
      .eq("recipient", userAddress)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false)
      .order("created_at", { ascending: false });

    if (options?.schemaUid) {
      query = query.eq("schema_uid", options.schemaUid);
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1,
      );
    }

    const { data, error } = await query;

    if (error) {
      log.error("Error fetching user attestations", { error });
      return [];
    }

    return data || [];
  } catch (error) {
    log.error("Error fetching user attestations", { error });
    return [];
  }
};

/**
 * Get attestations by schema UID
 */
export const getAttestationsBySchema = async (
  schemaUid: string,
  options?: {
    limit?: number;
    offset?: number;
    network?: string;
  },
): Promise<Attestation[]> => {
  try {
    const resolvedNetwork = options?.network || getDefaultNetworkName();
    let query = supabase
      .from("attestations")
      .select(
        `
        *,
        attestation_schemas (
          name,
          description,
          category
        )
      `,
      )
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false)
      .order("created_at", { ascending: false });

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    if (options?.offset) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1,
      );
    }

    const { data, error } = await query;

    if (error) {
      log.error("Error fetching attestations by schema", { error });
      return [];
    }

    return data || [];
  } catch (error) {
    log.error("Error fetching attestations by schema", { error });
    return [];
  }
};

/**
 * Get attestation by UID
 */
export const getAttestationByUid = async (
  attestationUid: string,
): Promise<Attestation | null> => {
  try {
    const { data, error } = await supabase
      .from("attestations")
      .select(
        `
        *,
        attestation_schemas (
          name,
          description,
          category
        )
      `,
      )
      .eq("attestation_uid", attestationUid)
      .single();

    if (error || !data) {
      log.error("Attestation not found", { error });
      return null;
    }

    return data;
  } catch (error) {
    log.error("Error fetching attestation", { error });
    return null;
  }
};

/**
 * Check if user has attestation for specific schema
 */
export const hasUserAttestation = async (
  userAddress: string,
  schemaUid: string,
  network?: string,
): Promise<boolean> => {
  try {
    const resolvedNetwork = network || getDefaultNetworkName();
    const { data } = await supabase
      .from("attestations")
      .select("id")
      .eq("recipient", userAddress)
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false)
      .single();

    return !!data;
  } catch (error) {
    return false;
  }
};

/**
 * Get daily check-in streak for user
 */
export const getUserDailyCheckinStreak = async (
  userAddress: string,
  network?: string,
): Promise<number> => {
  try {
    const resolvedNetwork = network || getDefaultNetworkName();
    // Get daily check-ins for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const { data: checkins } = await supabase
      .from("attestations")
      .select("created_at")
      .eq("recipient", userAddress)
      .eq("schema_uid", "0xp2e_daily_checkin_001") // Daily check-in schema UID
      .eq("network", resolvedNetwork)
      .gte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (!checkins || checkins.length === 0) {
      return 0;
    }

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    const normalizedDayTimestamps = Array.from(
      new Set(
        checkins.map((checkin) => {
          const date = new Date(checkin.created_at);
          date.setHours(0, 0, 0, 0);
          return date.getTime();
        }),
      ),
    ).sort((a, b) => b - a);

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let expectedTimestamp = today.getTime();

    for (const dayTimestamp of normalizedDayTimestamps) {
      if (dayTimestamp === expectedTimestamp) {
        streak++;
        expectedTimestamp -= MS_PER_DAY;
        continue;
      }

      if (dayTimestamp < expectedTimestamp) {
        break;
      }
    }

    return streak;
  } catch (error) {
    log.error("Error calculating streak", { error });
    return 0;
  }
};

/**
 * Get total attestations count for user
 */
export const getUserAttestationCount = async (
  userAddress: string,
  schemaUid?: string,
  network?: string,
): Promise<number> => {
  try {
    const resolvedNetwork = network || getDefaultNetworkName();
    let query = supabase
      .from("attestations")
      .select("id", { count: "exact", head: true })
      .eq("recipient", userAddress)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false);

    if (schemaUid) {
      query = query.eq("schema_uid", schemaUid);
    }

    const { count, error } = await query;

    if (error) {
      log.error("Error counting attestations", { error });
      return 0;
    }

    return count || 0;
  } catch (error) {
    log.error("Error counting attestations", { error });
    return 0;
  }
};

/**
 * Get recent attestations across all users for a schema
 */
export const getRecentAttestations = async (
  schemaUid: string,
  limit = 10,
  network?: string,
): Promise<Attestation[]> => {
  try {
    const resolvedNetwork = network || getDefaultNetworkName();
    const { data, error } = await supabase
      .from("attestations")
      .select(
        `
        *,
        attestation_schemas (
          name,
          description,
          category
        )
      `,
      )
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      log.error("Error fetching recent attestations", { error });
      return [];
    }

    return data || [];
  } catch (error) {
    log.error("Error fetching recent attestations", { error });
    return [];
  }
};

/**
 * Get attestation statistics for a schema
 */
export const getSchemaStatistics = async (
  schemaUid: string,
  network?: string,
): Promise<{
  totalCount: number;
  uniqueUsers: number;
  todayCount: number;
  thisWeekCount: number;
}> => {
  try {
    const resolvedNetwork = network || getDefaultNetworkName();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get total count
    const { count: totalCount } = await supabase
      .from("attestations")
      .select("id", { count: "exact", head: true })
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false);

    // Get unique users
    const { data: uniqueUsersData } = await supabase
      .from("attestations")
      .select("recipient")
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false);

    const uniqueUsers = new Set(uniqueUsersData?.map((a) => a.recipient) || [])
      .size;

    // Get today's count
    const { count: todayCount } = await supabase
      .from("attestations")
      .select("id", { count: "exact", head: true })
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false)
      .gte("created_at", today.toISOString());

    // Get this week's count
    const { count: thisWeekCount } = await supabase
      .from("attestations")
      .select("id", { count: "exact", head: true })
      .eq("schema_uid", schemaUid)
      .eq("network", resolvedNetwork)
      .eq("is_revoked", false)
      .gte("created_at", weekAgo.toISOString());

    return {
      totalCount: totalCount || 0,
      uniqueUsers,
      todayCount: todayCount || 0,
      thisWeekCount: thisWeekCount || 0,
    };
  } catch (error) {
    log.error("Error fetching schema statistics", { error });
    return {
      totalCount: 0,
      uniqueUsers: 0,
      todayCount: 0,
      thisWeekCount: 0,
    };
  }
};

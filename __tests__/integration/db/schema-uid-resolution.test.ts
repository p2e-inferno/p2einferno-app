import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import {
  __clearSchemaResolverCacheForTests,
  resolveSchemaUID,
} from "@/lib/attestation/schemas/network-resolver";

jest.unmock("@/lib/supabase/server");

const { createAdminClient } = jest.requireActual(
  "@/lib/supabase/server",
) as typeof import("@/lib/supabase/server");

const loadEnvFromLocal = () => {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...rest] = trimmed.split("=");
    if (!key) return;
    const value = rest.join("=").replace(/^"|"$/g, "");
    if (value) {
      process.env[key] = value;
    }
  });
};

loadEnvFromLocal();

const fetchImpl = require("node-fetch");
global.fetch = fetchImpl.default || fetchImpl;

const hasDbEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY);

const describeDb = hasDbEnv ? describe : describe.skip;

const makeSchemaUid = () => `0x${randomBytes(32).toString("hex")}`;

describeDb("schema UID resolution (DB)", () => {
  const network = "base-sepolia";
  const schemaKey = `test_schema_key_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2)}`.toLowerCase();
  const schemaUidOld = makeSchemaUid();
  const schemaUidNew = makeSchemaUid();
  const insertedSchemaUids: string[] = [];
  const insertedAttestations: string[] = [];
  const insertedProfileIds: string[] = [];

  const supabase = createAdminClient();

  const makeWalletAddress = () => `0x${randomBytes(20).toString("hex")}`;

  const makeUtcDateAtHour = (daysAgo: number, hourUtc: number) => {
    const now = new Date();
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - daysAgo,
        hourUtc,
        0,
        0,
      ),
    );
  };

  const insertUserProfile = async (walletAddress: string) => {
    const privyUserId = `privy_${randomBytes(10).toString("hex")}`;
    const { data, error } = await supabase
      .from("user_profiles")
      .insert({
        privy_user_id: privyUserId,
        wallet_address: walletAddress.toLowerCase(),
        display_name: "Streak Test User",
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(`Failed to insert user profile: ${error?.message}`);
    }
    insertedProfileIds.push(data.id);
    return data.id as string;
  };

  const insertDailyCheckinActivity = async (
    profileId: string,
    createdAt: Date,
  ) => {
    const { error } = await supabase.from("user_activities").insert({
      user_profile_id: profileId,
      activity_type: "daily_checkin",
      created_at: createdAt.toISOString(),
    });

    if (error) {
      throw new Error(`Failed to insert activity: ${error.message}`);
    }
  };

  const getStreakV1 = async (walletAddress: string) => {
    const { data, error } = await supabase.rpc("get_user_checkin_streak", {
      user_address: walletAddress,
    });
    if (error) {
      const message = error.message || "";
      if (message.includes("function public.get_user_checkin_streak")) {
        return null;
      }
      throw new Error(`get_user_checkin_streak failed: ${message}`);
    }
    return data as number;
  };

  const getStreakV2 = async (walletAddress: string) => {
    const { data, error } = await supabase.rpc("get_user_checkin_streak_v2", {
      user_address: walletAddress,
      p_network: network,
    });
    if (error) {
      const message = error.message || "";
      if (message.includes("function public.get_user_checkin_streak_v2")) {
        return null;
      }
      throw new Error(`get_user_checkin_streak_v2 failed: ${message}`);
    }
    return data as number;
  };

  const insertSchema = async (schemaUid: string, createdAt: string) => {
    const { error } = await supabase.from("attestation_schemas").insert({
      schema_uid: schemaUid,
      name: `Test Schema ${schemaUid.slice(0, 10)}`,
      description: "Test schema for resolver",
      schema_definition: "string example",
      category: "achievement",
      revocable: false,
      network,
      schema_key: schemaKey,
      created_at: createdAt,
    });

    if (error) {
      throw new Error(`Failed to insert schema: ${error.message}`);
    }
    insertedSchemaUids.push(schemaUid);
  };

  afterAll(async () => {
    if (!hasDbEnv) return;
    if (insertedAttestations.length > 0) {
      await supabase
        .from("attestations")
        .delete()
        .in("attestation_uid", insertedAttestations);
    }
    if (insertedProfileIds.length > 0) {
      await supabase
        .from("user_activities")
        .delete()
        .in("user_profile_id", insertedProfileIds);
      await supabase
        .from("user_profiles")
        .delete()
        .in("id", insertedProfileIds);
    }
    if (insertedSchemaUids.length > 0) {
      await supabase
        .from("attestation_schemas")
        .delete()
        .in("schema_uid", insertedSchemaUids)
        .eq("network", network);
    }
    await supabase.from("eas_schema_keys").delete().eq("key", schemaKey);
  });

  it("returns the latest schema UID for a key+network", async () => {
    const { error: keyError } = await supabase.from("eas_schema_keys").insert({
      key: schemaKey,
      label: "Test Schema Key",
      description: "Test key for resolver",
      active: true,
    });
    if (keyError) {
      throw new Error(`Failed to insert schema key: ${keyError.message}`);
    }

    await insertSchema(schemaUidOld, "2024-01-01T00:00:00Z");
    await insertSchema(schemaUidNew, "2024-02-01T00:00:00Z");

    __clearSchemaResolverCacheForTests();
    const resolved = await resolveSchemaUID(schemaKey as any, network);
    expect(resolved).toBe(schemaUidNew);
  });

  it("get_schema_uid returns the latest schema UID when available", async () => {
    const { data, error } = await supabase.rpc("get_schema_uid", {
      p_schema_key: schemaKey,
      p_network: network,
    });

    if (error) {
      const message = error.message || "";
      if (message.includes("function public.get_schema_uid")) {
        return;
      }
      throw new Error(`get_schema_uid failed: ${message}`);
    }

    expect(data).toBe(schemaUidNew);
  });

  it("get_user_checkin_streak_v2 uses the latest daily_checkin schema UID", async () => {
    const { error: helperError } = await supabase.rpc("get_schema_uid", {
      p_schema_key: "daily_checkin",
      p_network: network,
    });

    if (helperError) {
      const message = helperError.message || "";
      if (message.includes("function public.get_schema_uid")) {
        return;
      }
      throw new Error(`get_schema_uid failed: ${message}`);
    }

    const dailySchemaUid = makeSchemaUid();
    const attestationUid = makeSchemaUid();
    const recipient = "0x" + "1".repeat(40);
    const attester = "0x" + "2".repeat(40);

    const { error: schemaError } = await supabase
      .from("attestation_schemas")
      .insert({
        schema_uid: dailySchemaUid,
        name: "Daily Check-in (Test)",
        description: "Test daily check-in",
        schema_definition: "string note",
        category: "achievement",
        revocable: false,
        network,
        schema_key: "daily_checkin",
        created_at: new Date().toISOString(),
      });

    if (schemaError) {
      throw new Error(
        `Failed to insert daily check-in schema: ${schemaError.message}`,
      );
    }
    insertedSchemaUids.push(dailySchemaUid);

    const { error: attestationError } = await supabase
      .from("attestations")
      .insert({
        attestation_uid: attestationUid,
        schema_uid: dailySchemaUid,
        network,
        attester,
        recipient,
        data: { note: "test" },
        is_revoked: false,
      });

    if (attestationError) {
      throw new Error(
        `Failed to insert daily check-in attestation: ${attestationError.message}`,
      );
    }
    insertedAttestations.push(attestationUid);

    const { data: streak, error: streakError } = await supabase.rpc(
      "get_user_checkin_streak_v2",
      {
        user_address: recipient,
        p_network: network,
      },
    );

    if (streakError) {
      const message = streakError.message || "";
      if (message.includes("function public.get_user_checkin_streak_v2")) {
        return;
      }
      throw new Error(
        `get_user_checkin_streak_v2 failed: ${streakError.message}`,
      );
    }

    expect(streak).toBeGreaterThan(0);
  });

  it("get_user_checkin_streak_v2 counts yesterday's check-in before today's check-in", async () => {
    const { data: resolvedSchemaUid, error: helperError } = await supabase.rpc(
      "get_schema_uid",
      {
        p_schema_key: "daily_checkin",
        p_network: network,
      },
    );

    if (helperError) {
      const message = helperError.message || "";
      if (message.includes("function public.get_schema_uid")) {
        return;
      }
      throw new Error(`get_schema_uid failed: ${message}`);
    }

    if (!resolvedSchemaUid) {
      return;
    }

    const attestationUid = makeSchemaUid();
    const recipient = `0x${randomBytes(20).toString("hex")}`;
    const attester = "0x" + "2".repeat(40);
    const now = new Date();
    const yesterdayAtNoonUtc = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1,
        12,
        0,
        0,
      ),
    );

    const { error: attestationError } = await supabase
      .from("attestations")
      .insert({
        attestation_uid: attestationUid,
        schema_uid: resolvedSchemaUid,
        network,
        attester,
        recipient,
        data: { note: "test-yesterday" },
        is_revoked: false,
        created_at: yesterdayAtNoonUtc.toISOString(),
      });

    if (attestationError) {
      throw new Error(
        `Failed to insert daily check-in attestation: ${attestationError.message}`,
      );
    }
    insertedAttestations.push(attestationUid);

    const { data: streak, error: streakError } = await supabase.rpc(
      "get_user_checkin_streak_v2",
      {
        user_address: recipient,
        p_network: network,
      },
    );

    if (streakError) {
      const message = streakError.message || "";
      if (message.includes("function public.get_user_checkin_streak_v2")) {
        return;
      }
      throw new Error(
        `get_user_checkin_streak_v2 failed: ${streakError.message}`,
      );
    }

    expect(streak).toBe(1);
  });

  it("keeps v1/v2 parity for user_activities-only streaks (yesterday anchor)", async () => {
    const walletAddress = makeWalletAddress();
    const profileId = await insertUserProfile(walletAddress);

    await insertDailyCheckinActivity(profileId, makeUtcDateAtHour(1, 12));
    await insertDailyCheckinActivity(profileId, makeUtcDateAtHour(2, 12));

    const streakV1 = await getStreakV1(walletAddress);
    const streakV2 = await getStreakV2(walletAddress);

    if (streakV1 == null || streakV2 == null) return;
    expect(streakV1).toBe(2);
    expect(streakV2).toBe(2);
    expect(streakV1).toEqual(streakV2);
  });

  it("keeps v1/v2 parity for attestations (today + yesterday)", async () => {
    const { data: resolvedSchemaUid, error: helperError } = await supabase.rpc(
      "get_schema_uid",
      {
        p_schema_key: "daily_checkin",
        p_network: network,
      },
    );

    if (helperError) {
      const message = helperError.message || "";
      if (message.includes("function public.get_schema_uid")) {
        return;
      }
      throw new Error(`get_schema_uid failed: ${message}`);
    }

    const schemaUidForInsert = resolvedSchemaUid || "0xp2e_daily_checkin_001";
    const recipient = makeWalletAddress();
    const attester = "0x" + "2".repeat(40);
    const yesterdayAtNoonUtc = makeUtcDateAtHour(1, 12);
    const todayAtNoonUtc = makeUtcDateAtHour(0, 12);

    const attestationUidYesterday = makeSchemaUid();
    const attestationUidToday = makeSchemaUid();

    const { error: insertYesterdayError } = await supabase
      .from("attestations")
      .insert({
        attestation_uid: attestationUidYesterday,
        schema_uid: schemaUidForInsert,
        network,
        attester,
        recipient,
        data: { note: "test-yesterday" },
        is_revoked: false,
        created_at: yesterdayAtNoonUtc.toISOString(),
      });

    if (insertYesterdayError) {
      throw new Error(
        `Failed to insert daily check-in attestation (yesterday): ${insertYesterdayError.message}`,
      );
    }
    insertedAttestations.push(attestationUidYesterday);

    const { error: insertTodayError } = await supabase
      .from("attestations")
      .insert({
        attestation_uid: attestationUidToday,
        schema_uid: schemaUidForInsert,
        network,
        attester,
        recipient,
        data: { note: "test-today" },
        is_revoked: false,
        created_at: todayAtNoonUtc.toISOString(),
      });

    if (insertTodayError) {
      throw new Error(
        `Failed to insert daily check-in attestation (today): ${insertTodayError.message}`,
      );
    }
    insertedAttestations.push(attestationUidToday);

    const streakV1 = await getStreakV1(recipient);
    const streakV2 = await getStreakV2(recipient);

    if (streakV1 == null || streakV2 == null) return;
    expect(streakV1).toBe(2);
    expect(streakV2).toBe(2);
  });

  it("keeps v1/v2 parity for broken streaks (older than yesterday)", async () => {
    const walletAddress = makeWalletAddress();
    const profileId = await insertUserProfile(walletAddress);

    await insertDailyCheckinActivity(profileId, makeUtcDateAtHour(3, 12));

    const streakV1 = await getStreakV1(walletAddress);
    const streakV2 = await getStreakV2(walletAddress);

    if (streakV1 == null || streakV2 == null) return;
    expect(streakV1).toBe(0);
    expect(streakV2).toBe(0);
  });

  it("keeps v1/v2 parity for attestations (yesterday only, no today) - anchoring test", async () => {
    const { data: resolvedSchemaUid, error: helperError } = await supabase.rpc(
      "get_schema_uid",
      {
        p_schema_key: "daily_checkin",
        p_network: network,
      },
    );

    if (helperError) {
      const message = helperError.message || "";
      if (message.includes("function public.get_schema_uid")) {
        return;
      }
      throw new Error(`get_schema_uid failed: ${message}`);
    }

    const schemaUidForInsert = resolvedSchemaUid || "0xp2e_daily_checkin_001";
    const recipient = makeWalletAddress();
    const attester = "0x" + "2".repeat(40);
    const yesterdayAtNoonUtc = makeUtcDateAtHour(1, 12);

    const attestationUidYesterday = makeSchemaUid();

    const { error: insertYesterdayError } = await supabase
      .from("attestations")
      .insert({
        attestation_uid: attestationUidYesterday,
        schema_uid: schemaUidForInsert,
        network,
        attester,
        recipient,
        data: { note: "test-yesterday-only" },
        is_revoked: false,
        created_at: yesterdayAtNoonUtc.toISOString(),
      });

    if (insertYesterdayError) {
      throw new Error(
        `Failed to insert daily check-in attestation (yesterday): ${insertYesterdayError.message}`,
      );
    }
    insertedAttestations.push(attestationUidYesterday);

    const streakV1 = await getStreakV1(recipient);
    const streakV2 = await getStreakV2(recipient);

    if (streakV1 == null || streakV2 == null) return;
    expect(streakV1).toBe(1);
    expect(streakV2).toBe(1);
  });
});

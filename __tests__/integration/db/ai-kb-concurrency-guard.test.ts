import fs from "fs";
import path from "path";

jest.unmock("@/lib/supabase/server");

const { createAdminClient } = jest.requireActual(
  "@/lib/supabase/server",
) as typeof import("@/lib/supabase/server");

function loadEnvFromLocal() {
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
}

loadEnvFromLocal();

const fetchImpl = require("node-fetch");
global.fetch = fetchImpl.default || fetchImpl;

/**
 * Integration tests for AI KB concurrency guard via acquire_ingestion_lock RPC.
 *
 * The accepted concurrency design uses an atomic PL/pgSQL RPC that:
 * - checks for a blocking started run,
 * - marks stale started runs as failed,
 * - inserts a new started run when acquisition succeeds.
 *
 * These tests require a running local Supabase instance with migration 155 applied.
 * Skip in CI if Supabase is not available.
 *
 * Run with: npx jest __tests__/integration/db/ai-kb-concurrency-guard.test.ts
 */

const hasRealDbEnv =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY) &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("test-project.supabase.co");

const describeIntegration = hasRealDbEnv ? describe : describe.skip;

interface AcquireLockRow {
  status: "acquired" | "blocked";
  run_id: string | null;
  blocking_run_id: string | null;
  stale_cleared: boolean;
}

describeIntegration("AI KB Concurrency Guard RPC", () => {
  let supabase: ReturnType<typeof createAdminClient>;

  function getSupabase() {
    if (!supabase) {
      supabase = createAdminClient();
    }
    return supabase;
  }

  beforeAll(() => {
    supabase = getSupabase();
  });

  beforeEach(async () => {
    await getSupabase()
      .from("ai_kb_ingestion_runs")
      .delete()
      .like("error_message", "test:concurrency-%");
  });

  afterAll(async () => {
    await getSupabase()
      .from("ai_kb_ingestion_runs")
      .delete()
      .like("error_message", "test:concurrency-%");
  });

  async function acquireLock(runType: "full" | "incremental" = "full") {
    const { data, error } = await supabase.rpc("acquire_ingestion_lock", {
      p_run_type: runType,
      p_stale_threshold_min: 60,
    });

    expect(error).toBeNull();

    const row = Array.isArray(data) ? data[0] : data;
    expect(row).toBeDefined();

    return row as AcquireLockRow;
  }

  it("acquires successfully when no blocking run exists", async () => {
    const result = await acquireLock("full");

    expect(result.status).toBe("acquired");
    expect(result.run_id).toBeTruthy();
    expect(result.blocking_run_id).toBeNull();
    expect(result.stale_cleared).toBe(false);

    const { data: createdRun, error } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("id, run_type, status")
      .eq("id", result.run_id)
      .single();

    expect(error).toBeNull();
    expect(createdRun?.run_type).toBe("full");
    expect(createdRun?.status).toBe("started");
  });

  it("returns blocked when an active started run exists", async () => {
    const { data: blockingRun, error: insertError } = await supabase
      .from("ai_kb_ingestion_runs")
      .insert({
        run_type: "full",
        status: "started",
        error_message: "test:concurrency-blocking",
      })
      .select("id")
      .single();

    expect(insertError).toBeNull();
    expect(blockingRun?.id).toBeTruthy();

    const result = await acquireLock("incremental");

    expect(result.status).toBe("blocked");
    expect(result.run_id).toBeNull();
    expect(result.blocking_run_id).toBe(blockingRun!.id);
    expect(result.stale_cleared).toBe(false);
  });

  it("marks stale started runs failed inside the RPC before acquiring", async () => {
    const staleStartedAt = new Date(Date.now() - 65 * 60 * 1000).toISOString();

    const { data: staleRun, error: insertError } = await supabase
      .from("ai_kb_ingestion_runs")
      .insert({
        run_type: "full",
        status: "started",
        started_at: staleStartedAt,
        error_message: "test:concurrency-stale",
      })
      .select("id")
      .single();

    expect(insertError).toBeNull();

    const result = await acquireLock("full");

    expect(result.status).toBe("acquired");
    expect(result.run_id).toBeTruthy();
    expect(result.blocking_run_id).toBeNull();
    expect(result.stale_cleared).toBe(true);

    const { data: updatedStaleRun, error } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("status, finished_at, error_message")
      .eq("id", staleRun!.id)
      .single();

    expect(error).toBeNull();
    expect(updatedStaleRun?.status).toBe("failed");
    expect(updatedStaleRun?.finished_at).toBeTruthy();
    expect(updatedStaleRun?.error_message).toContain(
      "Timed out: no completion after 60 minutes",
    );
  });

  it("completed runs do not block acquisition", async () => {
    const { error: insertError } = await supabase
      .from("ai_kb_ingestion_runs")
      .insert({
        run_type: "full",
        status: "completed",
        finished_at: new Date().toISOString(),
        error_message: "test:concurrency-completed",
      });

    expect(insertError).toBeNull();

    const result = await acquireLock("incremental");

    expect(result.status).toBe("acquired");
    expect(result.run_id).toBeTruthy();
    expect(result.blocking_run_id).toBeNull();
    expect(result.stale_cleared).toBe(false);

    const { data: startedRuns, error } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("id")
      .eq("status", "started");

    expect(error).toBeNull();
    expect(
      startedRuns?.some((run: { id: string }) => run.id === result.run_id),
    ).toBe(true);
  });

  it("two concurrent acquisition attempts do not both succeed", async () => {
    const [first, second] = await Promise.all([
      acquireLock("full"),
      acquireLock("incremental"),
    ]);

    const acquiredResults = [first, second].filter(
      (result) => result.status === "acquired",
    );
    const blockedResults = [first, second].filter(
      (result) => result.status === "blocked",
    );

    expect(acquiredResults).toHaveLength(1);
    expect(blockedResults).toHaveLength(1);
    const acquiredResult = acquiredResults[0];
    const blockedResult = blockedResults[0];
    expect(acquiredResult).toBeDefined();
    expect(blockedResult).toBeDefined();
    expect(acquiredResult?.run_id).toBeTruthy();
    expect(blockedResult?.blocking_run_id).toBe(acquiredResult?.run_id);

    const { data: startedRuns, error } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("id, status")
      .eq("status", "started");

    expect(error).toBeNull();
    expect(startedRuns).toHaveLength(1);
    expect(startedRuns?.[0]?.id).toBe(acquiredResult?.run_id);
  });
});

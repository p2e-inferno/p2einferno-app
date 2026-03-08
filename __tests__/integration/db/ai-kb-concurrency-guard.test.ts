/**
 * Integration tests for AI KB concurrency guard (table-based locking).
 *
 * The concurrency guard uses the ai_kb_ingestion_runs table to prevent
 * concurrent build.ts executions. A second invocation exits with code 0
 * when a run with status "started" already exists. Stale runs (> 60 min)
 * are auto-marked as failed.
 *
 * These tests require a running local Supabase instance with migration 155 applied.
 * Skip in CI if Supabase is not available.
 *
 * Run with: npx jest __tests__/integration/db/ai-kb-concurrency-guard.test.ts
 */

const SKIP_INTEGRATION =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY;

const describeIntegration = SKIP_INTEGRATION ? describe.skip : describe;

describeIntegration("AI KB Concurrency Guard", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createAdminClient } = require("@/lib/supabase/server");

  let supabase: ReturnType<typeof createAdminClient>;

  beforeAll(() => {
    supabase = createAdminClient();
  });

  afterAll(async () => {
    // Clean up test runs
    await supabase
      .from("ai_kb_ingestion_runs")
      .delete()
      .like("error_message", "test:concurrency-%");
  });

  it("prevents concurrent runs by detecting existing started run", async () => {
    // Insert a "started" run to simulate an in-progress build
    const { data: existingRun, error: insertError } = await supabase
      .from("ai_kb_ingestion_runs")
      .insert({
        run_type: "full",
        status: "started",
        error_message: "test:concurrency-guard",
      })
      .select()
      .single();

    expect(insertError).toBeNull();
    expect(existingRun).toBeDefined();

    // Check for active runs — this is what build.ts does before proceeding
    const { data: activeRuns } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("id, started_at")
      .eq("status", "started");

    expect(activeRuns).toBeDefined();
    expect(activeRuns!.length).toBeGreaterThanOrEqual(1);

    // Clean up
    await supabase
      .from("ai_kb_ingestion_runs")
      .delete()
      .eq("id", existingRun.id);
  });

  it("allows new run when no active runs exist", async () => {
    // Ensure no active runs
    const { data: activeRuns } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("id")
      .eq("status", "started")
      .like("error_message", "test:concurrency-%");

    // Clean up any leftover test runs
    if (activeRuns && activeRuns.length > 0) {
      for (const run of activeRuns) {
        await supabase
          .from("ai_kb_ingestion_runs")
          .update({ status: "failed" })
          .eq("id", run.id);
      }
    }

    // Should be able to insert a new started run
    const { data: newRun, error } = await supabase
      .from("ai_kb_ingestion_runs")
      .insert({
        run_type: "full",
        status: "started",
        error_message: "test:concurrency-allowed",
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(newRun).toBeDefined();
    expect(newRun.status).toBe("started");

    // Clean up
    await supabase
      .from("ai_kb_ingestion_runs")
      .delete()
      .eq("id", newRun.id);
  });

  it("marks stale runs (> 60 min) as failed", async () => {
    // Insert a run with started_at > 60 minutes ago
    const staleTime = new Date(
      Date.now() - 65 * 60 * 1000,
    ).toISOString();

    const { data: staleRun, error: insertError } = await supabase
      .from("ai_kb_ingestion_runs")
      .insert({
        run_type: "full",
        status: "started",
        started_at: staleTime,
        error_message: "test:concurrency-stale",
      })
      .select()
      .single();

    expect(insertError).toBeNull();

    // Simulate the stale run detection logic from build.ts
    const { data: activeRuns } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("id, started_at")
      .eq("status", "started");

    const staleRuns = (activeRuns ?? []).filter((run) => {
      const startedAt = new Date(run.started_at).getTime();
      const minutesSinceStart = (Date.now() - startedAt) / (1000 * 60);
      return minutesSinceStart > 60;
    });

    expect(staleRuns.length).toBeGreaterThanOrEqual(1);
    expect(staleRuns.some((r) => r.id === staleRun.id)).toBe(true);

    // Mark stale runs as failed (as build.ts would)
    for (const run of staleRuns) {
      await supabase
        .from("ai_kb_ingestion_runs")
        .update({
          status: "failed",
          error_message: "auto-marked as failed (stale > 60 min)",
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
    }

    // Verify it was updated
    const { data: updatedRun } = await supabase
      .from("ai_kb_ingestion_runs")
      .select("status")
      .eq("id", staleRun.id)
      .single();

    expect(updatedRun?.status).toBe("failed");

    // Clean up
    await supabase
      .from("ai_kb_ingestion_runs")
      .delete()
      .eq("id", staleRun.id);
  });
});

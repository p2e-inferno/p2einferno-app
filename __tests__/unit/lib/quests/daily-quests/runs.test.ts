import * as runs from "@/lib/quests/daily-quests/runs";

jest.mock("@/lib/notifications/telegram", () => ({
  broadcastTelegramNotification: jest.fn(async () => {}),
}));

function makeSupabaseMock(opts: {
  templates?: any[];
  tasks?: any[];
  dedupeInsert?: { data: any; error: any };
  onDedupeInsert?: jest.Mock;
}) {
  const todayUtc = new Date().toISOString().slice(0, 10);
  const runRow = {
    id: "run-1",
    daily_quest_template_id: "tmpl-1",
    run_date: todayUtc,
  };
  const runSelectBuilder: any = {
    eq: () => runSelectBuilder,
    maybeSingle: async () => ({ data: runRow, error: null }),
  };

  return {
    from: (table: string) => {
      if (table === "daily_quest_templates") {
        return {
          select: () => ({
            eq: async () => ({ data: opts.templates ?? [], error: null }),
          }),
        } as any;
      }
      if (table === "daily_quest_runs") {
        return {
          upsert: async () => ({ error: null }),
          select: () => runSelectBuilder,
        } as any;
      }
      if (table === "daily_quest_tasks") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: opts.tasks ?? [], error: null }),
            }),
          }),
        } as any;
      }
      if (table === "daily_quest_run_tasks") {
        return {
          upsert: async () => ({ error: null }),
        } as any;
      }
      if (table === "daily_quest_notifications") {
        const insertFn = opts.onDedupeInsert || jest.fn();
        return {
          insert: (payload: any) => {
            insertFn(payload);
            return {
              select: () => ({
                maybeSingle: async () =>
                  opts.dedupeInsert ?? {
                    data: { id: "dedupe-1" },
                    error: null,
                  },
              }),
            };
          },
        } as any;
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  } as any;
}

describe("daily quest runs", () => {
  it("ensureRefreshNotificationSent broadcasts only when dedupe row is inserted", async () => {
    const supabase = makeSupabaseMock({
      dedupeInsert: { data: { id: "dedupe-1" }, error: null },
    });

    const telegram = require("@/lib/notifications/telegram");
    await runs.ensureRefreshNotificationSent(
      supabase,
      "tmpl-1",
      "2026-01-01",
      "Title",
    );
    expect(telegram.broadcastTelegramNotification).toHaveBeenCalledTimes(1);
  });

  it("ensureRefreshNotificationSent does not broadcast on unique violation", async () => {
    const supabase = makeSupabaseMock({
      dedupeInsert: { data: null, error: { code: "23505" } },
    });

    const telegram = require("@/lib/notifications/telegram");
    await runs.ensureRefreshNotificationSent(
      supabase,
      "tmpl-1",
      "2026-01-01",
      "Title",
    );
    expect(telegram.broadcastTelegramNotification).toHaveBeenCalledTimes(0);
  });

  it("ensureTodayDailyRuns upserts run and snapshots tasks", async () => {
    const insertSpy = jest.fn();
    const supabase = makeSupabaseMock({
      templates: [{ id: "tmpl-1", title: "Template 1" }],
      tasks: [
        {
          id: "t1",
          title: "Task 1",
          description: "d",
          task_type: "daily_checkin",
          verification_method: "automatic",
          reward_amount: 1,
          order_index: 0,
          task_config: {},
        },
      ],
      onDedupeInsert: insertSpy,
    });

    await runs.ensureTodayDailyRuns(supabase);
    expect(insertSpy).toHaveBeenCalledTimes(1);
  });
});

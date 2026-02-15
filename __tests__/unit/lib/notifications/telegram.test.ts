import {
  sendTelegramMessage,
  formatNotificationMessage,
  broadcastTelegramNotification,
} from "@/lib/notifications/telegram";

// Save originals and spy on fetch
const originalEnv = { ...process.env };
let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  jest.restoreAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
    ok: true,
    text: async () => "{}",
  } as Response);
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ---------------------------------------------------------------------------
// formatNotificationMessage
// ---------------------------------------------------------------------------
describe("formatNotificationMessage", () => {
  it("formats message with emoji and bold title in HTML", () => {
    const result = formatNotificationMessage(
      "Task completed",
      "You did it!",
      null,
      "task_completed",
    );
    expect(result).toContain("<b>Task completed</b>");
    expect(result).toContain("\u2705"); // ✅
    expect(result).toContain("You did it!");
  });

  it("includes 'View in app' link when link is provided", () => {
    const result = formatNotificationMessage(
      "New quest",
      "Check it out",
      "/lobby/quests/abc",
      "quest_created",
    );
    expect(result).toContain(
      '<a href="https://app.example.com/lobby/quests/abc">View in app</a>',
    );
  });

  it("uses absolute URL directly when link starts with http", () => {
    const result = formatNotificationMessage(
      "External",
      "Link",
      "https://other.com/page",
      "task_completed",
    );
    expect(result).toContain('<a href="https://other.com/page">View in app</a>');
  });

  it("does not include link section when link is null", () => {
    const result = formatNotificationMessage(
      "Title",
      "Message",
      null,
      "task_completed",
    );
    expect(result).not.toContain("View in app");
  });

  it("HTML-escapes title and message content including double quotes", () => {
    const result = formatNotificationMessage(
      'Title <script> "quoted"',
      "Message & stuff > 1",
      null,
      "task_completed",
    );
    expect(result).toContain("Title &lt;script&gt; &quot;quoted&quot;");
    expect(result).toContain("Message &amp; stuff &gt; 1");
    expect(result).not.toContain("<script>");
  });

  it("uses default bell emoji for unknown notification type", () => {
    const result = formatNotificationMessage(
      "Title",
      "Message",
      null,
      "unknown_type",
    );
    expect(result).toContain("\uD83D\uDD14"); // 🔔
  });

  it("uses correct emojis for each known notification type", () => {
    expect(formatNotificationMessage("T", "M", null, "milestone_completed")).toContain("\uD83C\uDFC6");
    expect(formatNotificationMessage("T", "M", null, "enrollment_created")).toContain("\uD83D\uDCDA");
    expect(formatNotificationMessage("T", "M", null, "application_status")).toContain("\uD83D\uDCDD");
    expect(formatNotificationMessage("T", "M", null, "task_reviewed")).toContain("\uD83D\uDCEC");
  });
});

// ---------------------------------------------------------------------------
// sendTelegramMessage
// ---------------------------------------------------------------------------
describe("sendTelegramMessage", () => {
  it("sends POST to correct Telegram Bot API URL with bot token", async () => {
    await sendTelegramMessage(12345, "Hello");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-bot-token/sendMessage",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: 12345,
          text: "Hello",
          parse_mode: "HTML",
          disable_web_page_preview: false,
        }),
      }),
    );
  });

  it("returns { ok: true } when Telegram API returns 200", async () => {
    const result = await sendTelegramMessage(12345, "Hello");
    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: false } when Telegram API returns error", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => '{"description":"Forbidden: bot was blocked by the user"}',
    } as Response);

    const result = await sendTelegramMessage(12345, "Hello");
    expect(result).toEqual({ ok: false, error: "Telegram API: 403" });
  });

  it("returns { ok: false } when TELEGRAM_BOT_TOKEN is not configured", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    const result = await sendTelegramMessage(12345, "Hello");
    expect(result).toEqual({ ok: false, error: "Bot token not configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not throw on network errors", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("Network failure"));

    const result = await sendTelegramMessage(12345, "Hello");
    expect(result).toEqual({ ok: false, error: "Network failure" });
  });
});

// ---------------------------------------------------------------------------
// broadcastTelegramNotification
// ---------------------------------------------------------------------------
describe("broadcastTelegramNotification", () => {
  function mockSupabase(users: { telegram_chat_id: number }[] | null, error: any = null) {
    const mockLimit = jest.fn().mockResolvedValue({ data: users, error });
    const mockNot = jest.fn().mockReturnValue({ limit: mockLimit });
    const mockEq = jest.fn().mockReturnValue({ not: mockNot });
    const mockSelect = jest.fn().mockReturnValue({ eq: mockEq });
    const mockFrom = jest.fn().mockReturnValue({ select: mockSelect });
    return { from: mockFrom } as any;
  }

  it("queries all users with telegram_notifications_enabled = true", async () => {
    const supabase = mockSupabase([]);

    await broadcastTelegramNotification(
      supabase,
      "Title",
      "Message",
      null,
    );

    expect(supabase.from).toHaveBeenCalledWith("user_profiles");
  });

  it("sends message to each user's telegram_chat_id", async () => {
    const users = [
      { telegram_chat_id: 111 },
      { telegram_chat_id: 222 },
      { telegram_chat_id: 333 },
    ];
    const supabase = mockSupabase(users);

    await broadcastTelegramNotification(
      supabase,
      "New quest!",
      "Check it out",
      "/lobby/quests/abc",
    );

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    // Verify each chat_id was targeted
    for (const user of users) {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(`"chat_id":${user.telegram_chat_id}`),
        }),
      );
    }
  });

  it("continues sending to remaining users if one send fails", async () => {
    const users = [
      { telegram_chat_id: 111 },
      { telegram_chat_id: 222 },
    ];
    const supabase = mockSupabase(users);

    // First send fails, second succeeds
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 403, text: async () => "blocked" } as Response)
      .mockResolvedValueOnce({ ok: true, text: async () => "{}" } as Response);

    await broadcastTelegramNotification(
      supabase,
      "Title",
      "Msg",
      null,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("handles empty user list gracefully", async () => {
    const supabase = mockSupabase([]);

    await broadcastTelegramNotification(
      supabase,
      "Title",
      "Msg",
      null,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles null user list gracefully", async () => {
    const supabase = mockSupabase(null);

    await broadcastTelegramNotification(
      supabase,
      "Title",
      "Msg",
      null,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("handles database query error gracefully", async () => {
    const supabase = mockSupabase(null, { message: "DB error" });

    // Should not throw
    await broadcastTelegramNotification(
      supabase,
      "Title",
      "Msg",
      null,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

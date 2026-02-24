import { renderHook, act, waitFor } from "@testing-library/react";
import { useTelegramNotifications } from "@/hooks/useTelegramNotifications";

// Mock toast
jest.mock("react-hot-toast", () => {
  const toast = Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  });
  return { toast };
});

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

let fetchSpy: jest.SpyInstance;

const createPopupMock = () =>
  ({
    opener: null,
    location: { href: "" },
  }) as unknown as Window;

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  fetchSpy = jest.spyOn(global, "fetch");
});

// ---------------------------------------------------------------------------
// Initial state & status fetching
// ---------------------------------------------------------------------------
describe("initial state and status fetching", () => {
  it("starts with loading = true, enabled = false, linked = false", () => {
    // Don't resolve the fetch yet
    fetchSpy.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useTelegramNotifications());

    expect(result.current.loading).toBe(true);
    expect(result.current.enabled).toBe(false);
    expect(result.current.linked).toBe(false);
  });

  it("fetches status on mount via GET /api/user/telegram/activate", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true, linked: true }),
    } as Response);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/user/telegram/activate");
    expect(result.current.enabled).toBe(true);
    expect(result.current.linked).toBe(true);
  });

  it("sets loading = false after fetch completes even on error", async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.linked).toBe(false);
  });

  it("handles fetch network error gracefully", async () => {
    fetchSpy.mockRejectedValue(new Error("Network failure"));

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.enabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// enable() action
// ---------------------------------------------------------------------------
describe("enable() action", () => {
  beforeEach(() => {
    // Initial status fetch
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ enabled: false, linked: false }),
    } as Response);
  });

  it("calls POST /api/user/telegram/activate", async () => {
    // POST response
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deepLink: "https://t.me/Bot?start=token" }),
    } as Response);

    // Mock window.open
    const openSpy = jest
      .spyOn(window, "open")
      .mockImplementation(() => createPopupMock());

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enable();
    });

    // Second fetch call should be the POST
    expect(fetchSpy).toHaveBeenCalledWith("/api/user/telegram/activate", {
      method: "POST",
    });

    openSpy.mockRestore();
  });

  it("opens blank popup and navigates to deepLink when popup is allowed", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deepLink: "https://t.me/Bot?start=abc123" }),
    } as Response);

    const openSpy = jest
      .spyOn(window, "open")
      .mockImplementation(() => createPopupMock());

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enable();
    });

    expect(openSpy).toHaveBeenCalledWith("", "_blank");
    expect(result.current.blockedDeepLink).toBeNull();

    openSpy.mockRestore();
  });

  it("stores deepLink for manual fallback when popup is blocked", async () => {
    const { toast } = require("react-hot-toast");

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deepLink: "https://t.me/Bot?start=popupblocked" }),
    } as Response);

    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enable();
    });

    expect(openSpy).toHaveBeenCalledWith("", "_blank");
    expect(result.current.blockedDeepLink).toBe(
      "https://t.me/Bot?start=popupblocked",
    );
    expect(toast).toHaveBeenCalledWith(
      "Telegram didn't open automatically. Use the manual link to continue.",
    );

    openSpy.mockRestore();
  });

  it("does not open window if POST fails", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Server error" }),
    } as Response);

    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enable();
    });

    expect(openSpy).not.toHaveBeenCalled();

    openSpy.mockRestore();
  });

  it("clears blockedDeepLink when dismissBlockedDeepLink is called", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deepLink: "https://t.me/Bot?start=dismiss" }),
    } as Response);

    const openSpy = jest.spyOn(window, "open").mockImplementation(() => null);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.enable();
    });

    expect(result.current.blockedDeepLink).toBe(
      "https://t.me/Bot?start=dismiss",
    );

    act(() => {
      result.current.dismissBlockedDeepLink();
    });

    expect(result.current.blockedDeepLink).toBeNull();

    openSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// disable() action
// ---------------------------------------------------------------------------
describe("disable() action", () => {
  beforeEach(() => {
    // Initial status fetch: enabled
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ enabled: true, linked: true }),
    } as Response);
  });

  it("calls DELETE /api/user/telegram/activate", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.disable();
    });

    expect(fetchSpy).toHaveBeenCalledWith("/api/user/telegram/activate", {
      method: "DELETE",
    });
  });

  it("updates enabled = false and linked = false on success", async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.enabled).toBe(true));

    await act(async () => {
      await result.current.disable();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.linked).toBe(false);
  });

  it("handles DELETE API error gracefully", async () => {
    const { toast } = require("react-hot-toast");

    fetchSpy.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Failed to disable" }),
    } as Response);

    const { result } = renderHook(() => useTelegramNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.disable();
    });

    expect(toast.error).toHaveBeenCalled();
  });
});

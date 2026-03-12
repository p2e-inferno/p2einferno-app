import { renderHook, waitFor } from "@testing-library/react";
import { useChatAuthSession } from "@/hooks/chat/use-chat-auth-session";

const mockUsePrivy = jest.fn();

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockUsePrivy(),
}));

describe("useChatAuthSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("normalizes the chat auth context and resolves an access token once", async () => {
    const getAccessToken = jest.fn().mockResolvedValue("token-123");
    mockUsePrivy.mockReturnValue({
      user: { id: "did:privy:test", wallet: { address: "0x123" } },
      authenticated: true,
      ready: true,
      getAccessToken,
    });

    const { result } = renderHook(() => useChatAuthSession());

    expect(result.current.auth).toEqual({
      isReady: true,
      isAuthenticated: true,
      privyUserId: "did:privy:test",
      walletAddress: "0x123",
    });

    await expect(result.current.resolveAccessToken()).resolves.toBe(
      "token-123",
    );
    expect(getAccessToken).toHaveBeenCalledTimes(1);
  });

  it("degrades token failures to null without breaking auth context", async () => {
    mockUsePrivy.mockReturnValue({
      user: { id: "did:privy:test", wallet: { address: "0x123" } },
      authenticated: true,
      ready: true,
      getAccessToken: jest.fn().mockRejectedValue(new Error("token failure")),
    });

    const { result } = renderHook(() => useChatAuthSession());

    await waitFor(async () => {
      await expect(result.current.resolveAccessToken()).resolves.toBeNull();
    });
  });
});

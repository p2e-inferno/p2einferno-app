import { renderHook, waitFor } from "@testing-library/react";

const mockUsePrivy = jest.fn();
const mockUseRouter = jest.fn();
const bootstrapMock = jest.fn();

jest.mock("@privy-io/react-auth", () => ({
  usePrivy: () => mockUsePrivy(),
}));

jest.mock("next/router", () => ({
  useRouter: () => mockUseRouter(),
}));

jest.mock("@/lib/chat/controller", () => ({
  chatController: {
    bootstrap: (...args: unknown[]) => bootstrapMock(...args),
  },
}));

import { useChatBootstrap } from "@/hooks/chat/use-chat-bootstrap";

describe("useChatBootstrap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({ pathname: "/quests" });
    mockUsePrivy.mockReturnValue({
      user: { id: "did:privy:test", wallet: { address: "0x123" } },
      authenticated: true,
      ready: true,
      getAccessToken: jest.fn().mockResolvedValue("token-123"),
    });
  });

  it("passes authenticated Privy context and access token into bootstrap", async () => {
    renderHook(() => useChatBootstrap());

    await waitFor(() => {
      expect(bootstrapMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: "token-123",
          auth: expect.objectContaining({
            isAuthenticated: true,
            privyUserId: "did:privy:test",
          }),
          route: expect.objectContaining({
            pathname: "/quests",
            behavior: expect.objectContaining({ key: "quests" }),
          }),
        }),
      );
    });
  });

  it("degrades token errors to null access token instead of blocking bootstrap", async () => {
    mockUsePrivy.mockReturnValue({
      user: { id: "did:privy:test", wallet: { address: "0x123" } },
      authenticated: true,
      ready: true,
      getAccessToken: jest.fn().mockRejectedValue(new Error("token failure")),
    });

    renderHook(() => useChatBootstrap());

    await waitFor(() => {
      expect(bootstrapMock).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: null,
        }),
      );
    });
  });
});

const insert = jest.fn();
const select = jest.fn();
const eq = jest.fn();
const maybeSingle = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert,
      select,
    })),
  })),
}));

import {
  ChatAttachmentAccessError,
  persistChatAttachmentOwnership,
} from "@/lib/chat/server/attachment-access";

describe("persistChatAttachmentOwnership", () => {
  const identity = {
    authUserId: null,
    hasMembership: false,
    usageIdentity: {
      identityKey: "anon-session:owner-a",
      anonymousSessionId: "owner-a",
      shouldSetAnonymousCookie: false,
      ip: "203.0.113.10",
      privyUserId: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    select.mockReturnValue({ eq });
    eq.mockReturnValue({ maybeSingle });
  });

  it("claims an unowned pathname on first insert", async () => {
    insert.mockResolvedValue({ error: null });

    await expect(
      persistChatAttachmentOwnership({
        pathname: "chat-attachments/example.png",
        identity,
      }),
    ).resolves.toBeUndefined();

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "chat-attachments/example.png",
        owner_identity_key: "anon-session:owner-a",
      }),
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("allows idempotent retries by the same owner", async () => {
    insert.mockResolvedValue({
      error: { code: "23505", message: "duplicate key value" },
    });
    maybeSingle.mockResolvedValue({
      data: {
        pathname: "chat-attachments/example.png",
        owner_identity_key: "anon-session:owner-a",
        status: "uploaded",
      },
      error: null,
    });

    await expect(
      persistChatAttachmentOwnership({
        pathname: "chat-attachments/example.png",
        identity,
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects attempts to re-claim a pathname owned by another identity", async () => {
    insert.mockResolvedValue({
      error: { code: "23505", message: "duplicate key value" },
    });
    maybeSingle.mockResolvedValue({
      data: {
        pathname: "chat-attachments/example.png",
        owner_identity_key: "anon-session:owner-b",
        status: "uploaded",
      },
      error: null,
    });

    await expect(
      persistChatAttachmentOwnership({
        pathname: "chat-attachments/example.png",
        identity,
      }),
    ).rejects.toBeInstanceOf(ChatAttachmentAccessError);
  });
});

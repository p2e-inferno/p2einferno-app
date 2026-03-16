jest.mock("@/lib/blockchain/config/clients/public-client", () => ({
  createPublicClientUnified: jest.fn(),
}));

jest.mock("@/lib/services/user-key-service", () => ({
  checkUserKeyOwnership: jest.fn(),
}));

let warnLog: jest.Mock;

jest.mock("@/lib/utils/logger", () => ({
  getLogger: () => {
    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: (...args: unknown[]) => warnLog(...args),
      error: jest.fn(),
    };
  },
}));

import { createPublicClientUnified } from "@/lib/blockchain/config/clients/public-client";
import { checkUserKeyOwnership } from "@/lib/services/user-key-service";
import {
  clearChatMembershipCache,
  getChatMembershipCacheSize,
  hasActiveChatMembership,
} from "@/lib/chat/server/respond-membership";

const createPublicClientUnifiedMock =
  createPublicClientUnified as jest.MockedFunction<
    typeof createPublicClientUnified
  >;
const checkUserKeyOwnershipMock = checkUserKeyOwnership as jest.MockedFunction<
  typeof checkUserKeyOwnership
>;
type PublicClientResult = ReturnType<typeof createPublicClientUnified>;
type UserKeyOwnershipResult = Awaited<ReturnType<typeof checkUserKeyOwnership>>;
const originalNationLockAddress =
  process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS;

describe("hasActiveChatMembership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    warnLog = jest.fn();
    clearChatMembershipCache();
    process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS =
      "0x0000000000000000000000000000000000000001";
    createPublicClientUnifiedMock.mockReturnValue({} as PublicClientResult);
  });

  afterEach(() => {
    clearChatMembershipCache();
    if (originalNationLockAddress === undefined) {
      delete process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS;
      return;
    }

    process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS =
      originalNationLockAddress;
  });

  it("returns false when membership lookup errors", async () => {
    checkUserKeyOwnershipMock.mockRejectedValue(new Error("rpc down"));

    await expect(hasActiveChatMembership("did:1")).resolves.toBe(false);
  });

  it("returns true when the user has a valid key", async () => {
    const result: UserKeyOwnershipResult = {
      hasValidKey: true,
      checkedAddresses: ["0x123"],
      errors: [],
    };
    checkUserKeyOwnershipMock.mockResolvedValue(result);

    await expect(hasActiveChatMembership("did:2")).resolves.toBe(true);
  });

  it("warns once and falls back safely when membership env is missing", async () => {
    delete process.env.NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS;

    await expect(hasActiveChatMembership("did:2")).resolves.toBe(false);
    await expect(hasActiveChatMembership("did:3")).resolves.toBe(false);

    expect(warnLog).toHaveBeenCalledTimes(1);
    expect(warnLog).toHaveBeenCalledWith(
      "NEXT_PUBLIC_DG_NATION_LOCK_ADDRESS is missing; chat membership tier is disabled and all callers will be treated as non-members",
    );
    expect(checkUserKeyOwnershipMock).not.toHaveBeenCalled();
  });

  it("bounds membership cache growth", async () => {
    const result: UserKeyOwnershipResult = {
      hasValidKey: true,
      checkedAddresses: ["0x123"],
      errors: [],
    };
    checkUserKeyOwnershipMock.mockResolvedValue(result);

    for (let index = 0; index < 230; index += 1) {
      await hasActiveChatMembership(`did:${index}`);
    }

    expect(getChatMembershipCacheSize()).toBeLessThanOrEqual(200);
  });
});

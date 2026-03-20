import { GoodDollarVerificationStrategy } from "@/lib/quests/verification/gooddollar-verification";
import { createAdminClient } from "@/lib/supabase/server";
import { getUserWalletAddresses } from "@/lib/auth/privy";
import { getIdentityExpiry } from "@/lib/gooddollar/identity-sdk";

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

jest.mock("@/lib/auth/privy", () => ({
  getUserWalletAddresses: jest.fn(),
}));

jest.mock("@/lib/gooddollar/identity-sdk", () => ({
  getIdentityExpiry: jest.fn(),
  calculateExpiryTimestamp: jest.fn(
    (lastAuthenticated: bigint, authPeriod: bigint) =>
      Number(lastAuthenticated + authPeriod) * 1000,
  ),
  isVerificationExpired: jest.fn((expiryMs: number) => expiryMs <= Date.now()),
}));

function makeProfileLookup(result: { data: any; error: any }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

function makeMappedWalletLookup(result: { data: any; error: any }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

function makeLinkedWalletLookup(result: { data: any; error: any }) {
  return {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    neq: jest.fn().mockResolvedValue(result),
  };
}

describe("GoodDollarVerificationStrategy", () => {
  const createAdminClientMock = createAdminClient as jest.MockedFunction<
    typeof createAdminClient
  >;
  const getUserWalletAddressesMock =
    getUserWalletAddresses as jest.MockedFunction<typeof getUserWalletAddresses>;
  const getIdentityExpiryMock =
    getIdentityExpiry as jest.MockedFunction<typeof getIdentityExpiry>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("falls back across safe linked wallets when the current wallet is not the verified one", async () => {
    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(
          makeProfileLookup({
            data: {
              is_face_verified: true,
              face_verification_expiry: null,
            },
            error: null,
          }),
        )
        .mockReturnValueOnce(
          makeMappedWalletLookup({
            data: null,
            error: null,
          }),
        )
        .mockReturnValueOnce(
          makeMappedWalletLookup({
            data: null,
            error: null,
          }),
        )
        .mockReturnValueOnce(
          makeLinkedWalletLookup({
            data: [],
            error: null,
          }),
        ),
    } as any;

    createAdminClientMock.mockReturnValue(supabase);
    getUserWalletAddressesMock.mockResolvedValue([
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    ]);
    getIdentityExpiryMock
      .mockRejectedValueOnce(new Error("not verified on current wallet"))
      .mockResolvedValueOnce({
        lastAuthenticated: BigInt(Math.floor(Date.now() / 1000)),
        authPeriod: BigInt(86400),
      } as any);

    const strategy = new GoodDollarVerificationStrategy();
    const result = await strategy.verify(
      "gooddollar_verified",
      {},
      "did:privy:user-1",
      "0x1111111111111111111111111111111111111111",
      {},
    );

    expect(result.success).toBe(true);
    expect(getIdentityExpiryMock).toHaveBeenNthCalledWith(
      1,
      "0x1111111111111111111111111111111111111111",
    );
    expect(getIdentityExpiryMock).toHaveBeenNthCalledWith(
      2,
      "0x2222222222222222222222222222222222222222",
    );
    expect(result.metadata).toMatchObject({
      face_verification_wallet:
        "0x2222222222222222222222222222222222222222",
    });
  });

  test("honors the user's mapped verified wallet and does not rotate to another linked wallet", async () => {
    const mappedWallet = "0x2222222222222222222222222222222222222222";
    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(
          makeProfileLookup({
            data: {
              is_face_verified: true,
              face_verification_expiry: null,
            },
            error: null,
          }),
        )
        .mockReturnValueOnce(
          makeMappedWalletLookup({
            data: null,
            error: null,
          }),
        )
        .mockReturnValueOnce(
          makeMappedWalletLookup({
            data: { wallet_address: mappedWallet },
            error: null,
          }),
        ),
    } as any;

    createAdminClientMock.mockReturnValue(supabase);
    getUserWalletAddressesMock.mockResolvedValue([
      "0x1111111111111111111111111111111111111111",
      mappedWallet,
    ]);
    getIdentityExpiryMock.mockResolvedValueOnce({
      lastAuthenticated: BigInt(0),
      authPeriod: BigInt(0),
    } as any);

    const strategy = new GoodDollarVerificationStrategy();
    const result = await strategy.verify(
      "gooddollar_verified",
      {},
      "did:privy:user-1",
      "0x1111111111111111111111111111111111111111",
      {},
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("VERIFICATION_EXPIRED");
    expect(getIdentityExpiryMock).toHaveBeenCalledTimes(1);
    expect(getIdentityExpiryMock).toHaveBeenCalledWith(mappedWallet);
  });

  test("fails closed when the user has a mapped verified wallet that is no longer linked", async () => {
    const mappedWallet = "0x2222222222222222222222222222222222222222";
    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(
          makeProfileLookup({
            data: {
              is_face_verified: true,
              face_verification_expiry: null,
            },
            error: null,
          }),
        )
        .mockReturnValueOnce(
          makeMappedWalletLookup({
            data: null,
            error: null,
          }),
        )
        .mockReturnValueOnce(
          makeMappedWalletLookup({
            data: { wallet_address: mappedWallet, privy_user_id: "did:privy:user-1" },
            error: null,
          }),
        ),
    } as any;

    createAdminClientMock.mockReturnValue(supabase);
    getUserWalletAddressesMock.mockResolvedValue([
      "0x1111111111111111111111111111111111111111",
    ]);

    const strategy = new GoodDollarVerificationStrategy();
    const result = await strategy.verify(
      "gooddollar_verified",
      {},
      "did:privy:user-1",
      "0x1111111111111111111111111111111111111111",
      {},
    );

    expect(result.success).toBe(false);
    expect(result.code).toBe("GOODDOLLAR_RPC_ERROR");
    expect(getIdentityExpiryMock).not.toHaveBeenCalled();
  });
});

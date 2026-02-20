import {
  claimOrValidateVerifiedWalletOwnership,
  GOODDOLLAR_OWNERSHIP_CONFLICT_CODE,
  GOODDOLLAR_USER_WALLET_LOCKED_CODE,
} from "@/lib/gooddollar/verification-ownership";

function makeSelectBuilder(result: { data: any; error: any }) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(result),
  };
}

describe("gooddollar verification ownership", () => {
  const wallet = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const proofHash = "proof-hash";

  test("creates a new mapping when wallet and user have no prior ownership", async () => {
    const walletLookup = makeSelectBuilder({ data: null, error: null });
    const userLookup = makeSelectBuilder({ data: null, error: null });
    const insertBuilder = {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(walletLookup)
        .mockReturnValueOnce(userLookup)
        .mockReturnValueOnce(insertBuilder),
    } as any;

    const result = await claimOrValidateVerifiedWalletOwnership({
      supabase,
      walletAddress: wallet,
      privyUserId: "did:privy:user-1",
      proofHash,
    });

    expect(result).toEqual({ ok: true });
    expect(insertBuilder.insert).toHaveBeenCalled();
  });

  test("returns conflict when wallet is already mapped to another user", async () => {
    const walletLookup = makeSelectBuilder({
      data: { wallet_address: wallet, privy_user_id: "did:privy:other-user" },
      error: null,
    });

    const supabase = {
      from: jest.fn().mockReturnValueOnce(walletLookup),
    } as any;

    const result = await claimOrValidateVerifiedWalletOwnership({
      supabase,
      walletAddress: wallet,
      privyUserId: "did:privy:user-1",
      proofHash,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GOODDOLLAR_OWNERSHIP_CONFLICT_CODE);
      expect(result.message).toContain(wallet);
    }
  });

  test("returns conflict when user already mapped to another wallet", async () => {
    const walletLookup = makeSelectBuilder({ data: null, error: null });
    const userLookup = makeSelectBuilder({
      data: {
        wallet_address: "0x9999999999999999999999999999999999999999",
        privy_user_id: "did:privy:user-1",
      },
      error: null,
    });

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(walletLookup)
        .mockReturnValueOnce(userLookup),
    } as any;

    const result = await claimOrValidateVerifiedWalletOwnership({
      supabase,
      walletAddress: wallet,
      privyUserId: "did:privy:user-1",
      proofHash,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe(GOODDOLLAR_USER_WALLET_LOCKED_CODE);
    }
  });

  test("is idempotent for same user and same wallet", async () => {
    const walletLookup = makeSelectBuilder({
      data: { wallet_address: wallet, privy_user_id: "did:privy:user-1" },
      error: null,
    });
    const userLookup = makeSelectBuilder({
      data: { wallet_address: wallet, privy_user_id: "did:privy:user-1" },
      error: null,
    });

    let eqCalls = 0;
    const updateBuilder: Record<string, jest.Mock> = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn(() => {
        eqCalls += 1;
        if (eqCalls >= 2) return Promise.resolve({ error: null });
        return updateBuilder;
      }),
    };

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(walletLookup)
        .mockReturnValueOnce(userLookup)
        .mockReturnValueOnce(updateBuilder),
    } as any;

    const result = await claimOrValidateVerifiedWalletOwnership({
      supabase,
      walletAddress: wallet,
      privyUserId: "did:privy:user-1",
      proofHash,
    });

    expect(result).toEqual({ ok: true });
    expect(updateBuilder.update).toHaveBeenCalled();
  });
});

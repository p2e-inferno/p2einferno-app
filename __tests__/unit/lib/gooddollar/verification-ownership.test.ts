import {
  claimOrValidateVerifiedWalletOwnership,
  GOODDOLLAR_OWNERSHIP_CONFLICT_CODE,
  GOODDOLLAR_USER_WALLET_LOCKED_CODE,
  getGoodDollarVerifiedWalletOwnershipState,
  resolveSafeGoodDollarWalletCandidates,
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
    const userLookup = makeSelectBuilder({ data: null, error: null });

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

  test("prefers the user's mapped wallet when it is still linked", async () => {
    const walletLookup = makeSelectBuilder({
      data: null,
      error: null,
    });
    const userLookup = makeSelectBuilder({
      data: { wallet_address: wallet },
      error: null,
    });

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(walletLookup)
        .mockReturnValueOnce(userLookup)
        .mockReturnValueOnce(userLookup),
    } as any;

    const result = await resolveSafeGoodDollarWalletCandidates({
      supabase,
      privyUserId: "did:privy:user-1",
      linkedWallets: [
        wallet,
        "0x9999999999999999999999999999999999999999",
      ],
      preferredWallet: "0x9999999999999999999999999999999999999999",
    });

    expect(result).toEqual([wallet]);
  });

  test("filters out linked wallets claimed by another user when unmapped", async () => {
    const walletLookup = makeSelectBuilder({
      data: null,
      error: null,
    });
    const userLookup = makeSelectBuilder({
      data: null,
      error: null,
    });
    const linkedLookup = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      // Supabase builder resolves after the final filter call in this chain.
      // We model that by making neq terminal in these tests.
      neq: jest.fn().mockResolvedValue({
        data: [
          {
            wallet_address: "0x9999999999999999999999999999999999999999",
          },
        ],
        error: null,
      }),
    };

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(walletLookup)
        .mockReturnValueOnce(userLookup)
        .mockReturnValueOnce(linkedLookup),
    } as any;

    const result = await resolveSafeGoodDollarWalletCandidates({
      supabase,
      privyUserId: "did:privy:user-1",
      linkedWallets: [
        "0x9999999999999999999999999999999999999999",
        wallet,
      ],
      preferredWallet: "0x9999999999999999999999999999999999999999",
    });

    expect(result).toEqual([wallet]);
  });

  test("returns no candidates when the user already has a mapped wallet that is no longer linked", async () => {
    const ownershipWalletLookup = makeSelectBuilder({
      data: null,
      error: null,
    });
    const ownershipUserLookup = makeSelectBuilder({
      data: { wallet_address: wallet, privy_user_id: "did:privy:user-1" },
      error: null,
    });

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(ownershipWalletLookup)
        .mockReturnValueOnce(ownershipUserLookup),
    } as any;

    const result = await resolveSafeGoodDollarWalletCandidates({
      supabase,
      privyUserId: "did:privy:user-1",
      linkedWallets: ["0x9999999999999999999999999999999999999999"],
      preferredWallet: "0x9999999999999999999999999999999999999999",
    });

    expect(result).toEqual([]);
  });

  test("ignores preferred wallet when it is not in the linked-wallet list", async () => {
    const ownershipWalletLookup = makeSelectBuilder({
      data: null,
      error: null,
    });
    const ownershipUserLookup = makeSelectBuilder({
      data: null,
      error: null,
    });
    const linkedLookup = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      neq: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    };

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(ownershipWalletLookup)
        .mockReturnValueOnce(ownershipUserLookup)
        .mockReturnValueOnce(linkedLookup),
    } as any;

    const result = await resolveSafeGoodDollarWalletCandidates({
      supabase,
      privyUserId: "did:privy:user-1",
      linkedWallets: [wallet],
      preferredWallet: "0x9999999999999999999999999999999999999999",
    });

    expect(result).toEqual([wallet]);
    expect(linkedLookup.in).toHaveBeenCalledWith("wallet_address", [wallet]);
    expect(linkedLookup.neq).toHaveBeenCalledWith(
      "privy_user_id",
      "did:privy:user-1",
    );
  });

  test("exposes the same ownership state used by the claim flow", async () => {
    const walletLookup = makeSelectBuilder({
      data: { wallet_address: wallet, privy_user_id: "did:privy:user-1" },
      error: null,
    });
    const userLookup = makeSelectBuilder({
      data: { wallet_address: wallet, privy_user_id: "did:privy:user-1" },
      error: null,
    });

    const supabase = {
      from: jest
        .fn()
        .mockReturnValueOnce(walletLookup)
        .mockReturnValueOnce(userLookup),
    } as any;

    const result = await getGoodDollarVerifiedWalletOwnershipState({
      supabase,
      walletAddress: wallet,
      privyUserId: "did:privy:user-1",
    });

    expect(result).toEqual({
      walletOwner: {
        wallet_address: wallet,
        privy_user_id: "did:privy:user-1",
      },
      userWallet: {
        wallet_address: wallet,
        privy_user_id: "did:privy:user-1",
      },
    });
  });
});

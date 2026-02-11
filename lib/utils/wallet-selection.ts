import { type User } from "@privy-io/react-auth";
import { isExternalWallet } from "@/lib/utils/wallet-address";

export interface LinkedWalletInfo {
  address: string;
  walletClientType?: string;
  connectorType?: string;
}

// Type for available wallets from useWallets()
export interface AvailableWallet {
  address?: string;
  walletClientType?: string;
  connectorType?: string;
}

/**
 * Extract all wallet addresses from a Privy user object (client-side).
 * This is the client-side equivalent of the server-side getUserWalletAddresses function.
 *
 * @param user Privy user object from useUser() hook
 * @returns Array of wallet address strings (empty array if no wallets)
 *
 * @example
 * const { user } = useUser();
 * const addresses = getWalletAddressesFromUser(user);
 * // ["0xabc...", "0xdef..."]
 */
export function getWalletAddressesFromUser(user?: User | null): string[] {
  if (!user?.linkedAccounts) {
    return [];
  }

  return user.linkedAccounts
    .filter((account): account is Extract<typeof account, { type: "wallet"; address: string }> =>
      account.type === "wallet" && !!account.address
    )
    .map((account) => account.address);
}

/**
 * Shared wallet selection logic with device-awareness.
 * This is the single source of truth for wallet prioritization across the app.
 *
 * Priority:
 * 1. External wallet that is BOTH linked AND available on current device
 * 2. Any linked wallet (embedded - always available via Privy)
 * 3. null if no linked wallet available
 *
 * Security: This function ONLY returns wallets that are linked to the user's
 * Privy account. It never returns unlinked browser wallets.
 *
 * Cross-device handling: On mobile without MetaMask, this will skip the linked
 * MetaMask wallet and fall back to embedded wallet, avoiding "wallet not found" errors.
 */
export function selectLinkedWallet(
  user?: User | null,
  availableWallets?: AvailableWallet[]
): LinkedWalletInfo | null {
  if (!user?.linkedAccounts) {
    return null;
  }

  const walletAccounts = user.linkedAccounts.filter(
    (account) => account.type === "wallet"
  ) as Array<{
    address?: string;
    walletClientType?: string;
    connectorType?: string;
  }>;

  // Priority 1: External wallet that is BOTH linked AND available on device
  if (availableWallets && availableWallets.length > 0) {
    const linkedExternalWallets = walletAccounts.filter((account) =>
      isExternalWallet(account.walletClientType)
    );

    // Find linked external wallet that's also available on current device
    const availableExternal = linkedExternalWallets.find((linked) =>
      availableWallets.some(
        (available) =>
          available.address?.toLowerCase() === linked.address?.toLowerCase()
      )
    );

    if (availableExternal?.address) {
      return {
        address: availableExternal.address,
        walletClientType: availableExternal.walletClientType,
        connectorType: availableExternal.connectorType,
      };
    }
  }

  // Priority 2: Fallback to embedded wallet first (always available), then any linked wallet
  // First try to find an embedded wallet
  const embeddedWallet = walletAccounts.find(
    (account) => account.address && !isExternalWallet(account.walletClientType)
  );

  if (embeddedWallet?.address) {
    return {
      address: embeddedWallet.address,
      walletClientType: embeddedWallet.walletClientType,
      connectorType: embeddedWallet.connectorType,
    };
  }

  // Fallback to any linked wallet if no embedded wallet exists
  const anyWallet = walletAccounts.find((account) => account.address);

  if (anyWallet?.address) {
    return {
      address: anyWallet.address,
      walletClientType: anyWallet.walletClientType,
      connectorType: anyWallet.connectorType,
    };
  }

  return null;
}

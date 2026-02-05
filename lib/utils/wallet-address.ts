/**
 * Utility function to format wallet addresses consistently
 */
export function formatWalletAddress(address: string | null): string {
  if (!address) return "No wallet";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

/**
 * Determines if a wallet is an embedded (Privy-managed) wallet
 * @param walletClientType - The wallet client type from Privy
 * @returns true if the wallet is embedded, false otherwise
 */
export function isEmbeddedWallet(
  walletClientType: string | undefined | null,
): boolean {
  if (!walletClientType) return false;
  return walletClientType === "privy" || walletClientType === "privy-v2";
}

/**
 * Determines if a wallet is an external (user-controlled) wallet
 * @param walletClientType - The wallet client type from Privy
 * @returns true if the wallet is external (not embedded), false otherwise
 */
export function isExternalWallet(
  walletClientType: string | undefined | null,
): boolean {
  return !!walletClientType && !isEmbeddedWallet(walletClientType);
}

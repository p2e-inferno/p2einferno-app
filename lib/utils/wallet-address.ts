/**
 * Utility function to format wallet addresses consistently
 */
export function formatWalletAddress(address: string | null): string {
  if (!address) return "No wallet";
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}
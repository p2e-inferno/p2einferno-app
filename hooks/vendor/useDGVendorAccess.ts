import { useMemo } from "react";
import { useUser } from "@privy-io/react-auth";
import { useReadContract, useReadContracts } from "wagmi";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { getWalletAddressesFromUser } from "@/lib/utils/wallet-selection";
import { normalizeAddress } from "@/lib/utils/address";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGVendorAccess() {
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const activeWallet = normalizeAddress(walletAddress) as `0x${string}` | null;

  const linkedWallets = useMemo(() => {
    const addrs = getWalletAddressesFromUser(user)
      .map((a) => normalizeAddress(a) as `0x${string}` | null)
      .filter((a): a is `0x${string}` => !!a);
    return Array.from(new Set(addrs)).sort();
  }, [user]);

  // Multicall: check hasValidKey on the VENDOR contract for every linked wallet
  const { data: keyResults, isLoading: isKeyLoading } = useReadContracts({
    allowFailure: true,
    contracts: linkedWallets.map((address) => ({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "hasValidKey" as const,
      args: [address] as const,
    })),
    query: { enabled: linkedWallets.length > 0 },
  });

  const {
    data: pausedData,
    isLoading: isPausedLoading,
  } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "paused",
  });

  const derived = useMemo(() => {
    const hasKeyByAddress: Record<string, boolean> = {};

    if (keyResults) {
      linkedWallets.forEach((addr, i) => {
        const result = keyResults[i];
        hasKeyByAddress[addr] =
          result?.status === "success" ? Boolean(result.result) : false;
      });
    }

    const isKeyHolder = activeWallet ? Boolean(hasKeyByAddress[activeWallet]) : false;
    const validAddresses = linkedWallets.filter((addr) => hasKeyByAddress[addr]);
    const hasValidKeyAnyLinked = validAddresses.length > 0;

    // Find the first valid wallet that is NOT the active wallet (for the "switch" hint)
    const keyHoldingWalletAddress =
      validAddresses.find((addr) => addr !== activeWallet) ??
      validAddresses[0] ??
      null;

    const hasKeyOnAnotherLinkedWallet =
      !isKeyHolder && hasValidKeyAnyLinked && !!keyHoldingWalletAddress;

    return {
      isKeyHolder,
      hasKeyOnAnotherLinkedWallet,
      keyHoldingWalletAddress,
      hasValidKeyAnyLinked,
    };
  }, [keyResults, linkedWallets, activeWallet]);

  return {
    ...derived,
    activeWalletAddress: activeWallet,
    isPaused: Boolean(pausedData),
    isLoading: isKeyLoading || isPausedLoading,
  };
}

import { useUser } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import { useDGNationKey } from "@/hooks/useDGNationKey";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGVendorAccess() {
  // useUser is kept to align hook lifetime with auth state, even though membership
  // checks are centralized in useDGNationKey.
  useUser();
  const {
    hasValidKey,
    hasValidKeyAnyLinked,
    validWalletAddress,
    activeWalletAddress,
    isLoading: isKeyLoading,
  } = useDGNationKey();

  const {
    data: pausedData,
    isLoading: isPausedLoading,
  } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "paused",
  });

  return {
    isKeyHolder: hasValidKey,
    hasKeyOnAnotherLinkedWallet:
      !hasValidKey && hasValidKeyAnyLinked && !!validWalletAddress,
    keyHoldingWalletAddress: validWalletAddress,
    activeWalletAddress,
    isPaused: Boolean(pausedData),
    isLoading: isKeyLoading || isPausedLoading,
  };
}

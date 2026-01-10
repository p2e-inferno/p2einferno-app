import { useUser } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;

export function useDGVendorAccess() {
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);

  const {
    data: hasKeyData,
    isLoading: isKeyLoading,
  } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "hasValidKey",
    args: [walletAddress! as `0x${string}`],
    query: { enabled: !!walletAddress },
  });

  const {
    data: pausedData,
    isLoading: isPausedLoading,
  } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "paused",
  });

  return {
    isKeyHolder: Boolean(hasKeyData),
    isPaused: Boolean(pausedData),
    isLoading: isKeyLoading || isPausedLoading,
  };
}

/**
 * useDGLightUp Hook
 *
 * Provides the "Light Up" functionality for the DGTokenVendor contract.
 * Light Up burns tokens to gain fuel and points.
 */

import { useUser } from "@privy-io/react-auth";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { useTokenApproval } from "@/hooks/useTokenApproval";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import type {
  StageConfigStruct,
  TokenConfigStruct,
  UserStateStruct,
} from "@/lib/blockchain/shared/vendor-types";
import { getLogger } from "@/lib/utils/logger";

const VENDOR_ADDRESS = process.env.NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;
const log = getLogger("hooks:vendor:light-up");

export function useDGLightUp() {
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);

  const { writeContract, data: hash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const { approveIfNeeded, isApproving: isApprovingToken } = useTokenApproval();

  const { data: tokenConfigRaw } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getTokenConfig",
  });
  const tokenConfig = tokenConfigRaw as TokenConfigStruct | undefined;

  const { data: userStateRaw } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getUserState",
    args: [walletAddress! as `0x${string}`],
    query: { enabled: !!walletAddress },
  });
  const userState = userStateRaw as UserStateStruct | undefined;

  const currentStage = userState?.stage ?? 0;

  const { data: stageConfigRaw } = useReadContract({
    address: VENDOR_ADDRESS,
    abi: DG_TOKEN_VENDOR_ABI,
    functionName: "getStageConfig",
    args: [currentStage],
  });
  const stageConfig = stageConfigRaw as StageConfigStruct | undefined;

    /**
     * Execute the Light Up action
     * Burns tokens based on current stage configuration
     */
  const lightUp = async () => {
    const baseToken = tokenConfig?.baseToken;
    const burnAmount = stageConfig?.burnAmount;

    if (!baseToken) {
      log.error("Cannot light up: base token address not available");
      return;
    }

    if (!burnAmount || burnAmount <= 0n) {
      log.error("Cannot light up: burnAmount not available", {
        burnAmount: burnAmount?.toString?.(),
        stage: currentStage,
      });
      return;
    }

    log.info("Checking approval for lightUp burn", {
      token: baseToken,
      spender: VENDOR_ADDRESS,
      amount: burnAmount.toString(),
      stage: currentStage,
    });

    const approvalResult = await approveIfNeeded({
      tokenAddress: baseToken,
      spenderAddress: VENDOR_ADDRESS,
      amount: burnAmount,
    });

    if (!approvalResult.success) {
      log.error("Token approval failed for lightUp", { error: approvalResult.error });
      return;
    }

    writeContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "lightUp",
    });
  };

    return {
        lightUp,
        isPending: isWritePending || isConfirming || isApprovingToken,
        isApproving: isApprovingToken,
        isSuccess,
        hash: hash ?? null,
    };
}

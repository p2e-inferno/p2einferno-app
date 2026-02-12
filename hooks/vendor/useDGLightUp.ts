/**
 * useDGLightUp Hook
 *
 * Provides the "Light Up" functionality for the DGTokenVendor contract.
 * Light Up burns tokens to gain fuel and points.
 */

import { useCallback } from "react";
import { useUser } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { useDetectConnectedWalletAddress } from "@/hooks/useDetectConnectedWalletAddress";
import { DG_TOKEN_VENDOR_ABI } from "@/lib/blockchain/shared/vendor-abi";
import type {
  StageConfigStruct,
  TokenConfigStruct,
  UserStateStruct,
} from "@/lib/blockchain/shared/vendor-types";
import type { TxResult } from "@/lib/transaction-stepper/types";
import { usePrivyWriteWallet } from "@/hooks/unlock/usePrivyWriteWallet";
import { createViemFromPrivyWallet } from "@/lib/blockchain/providers/privy-viem";
import { getBlockExplorerUrl } from "@/lib/blockchain/shared/network-utils";
import { getLogger } from "@/lib/utils/logger";

const VENDOR_ADDRESS = process.env
  .NEXT_PUBLIC_DG_VENDOR_ADDRESS as `0x${string}`;
const log = getLogger("hooks:vendor:light-up");

export function useDGLightUp() {
  const { user } = useUser();
  const { walletAddress } = useDetectConnectedWalletAddress(user);
  const wallet = usePrivyWriteWallet();

  const { data: tokenConfigRaw, isLoading: isTokenConfigLoading } =
    useReadContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "getTokenConfig",
    });
  const tokenConfig = tokenConfigRaw as TokenConfigStruct | undefined;

  const { data: userStateRaw, isLoading: isUserStateLoading } = useReadContract(
    {
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "getUserState",
      args: [walletAddress! as `0x${string}`],
      query: { enabled: !!walletAddress },
    },
  );
  const userState = userStateRaw as UserStateStruct | undefined;

  const currentStage = userState?.stage ?? 0;

  const { data: stageConfigRaw, isLoading: isStageConfigLoading } =
    useReadContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "getStageConfig",
      args: [currentStage],
    });
  const stageConfig = stageConfigRaw as StageConfigStruct | undefined;

  const baseTokenAddress = tokenConfig?.baseToken;
  const burnAmount = stageConfig?.burnAmount;
  const canLightUp = !!baseTokenAddress && !!burnAmount && burnAmount > 0n;

  const isLoadingConfig =
    isTokenConfigLoading || isUserStateLoading || isStageConfigLoading;

  const executeLightUpTx = useCallback(async (): Promise<TxResult> => {
    if (!wallet) {
      throw new Error("Wallet not connected");
    }

    const { walletClient, publicClient } =
      await createViemFromPrivyWallet(wallet);
    const userAddress = wallet.address as `0x${string}`;

    const txHash = await walletClient.writeContract({
      address: VENDOR_ADDRESS,
      abi: DG_TOKEN_VENDOR_ABI,
      functionName: "lightUp",
      account: walletClient.account ?? userAddress,
      chain: walletClient.chain,
    });

    if (!walletClient.chain) {
      throw new Error("Wallet chain not configured");
    }

    const explorerConfig = {
      chain: walletClient.chain,
      rpcUrl: "",
      networkName: walletClient.chain.name ?? "Unknown",
    };

    return {
      transactionHash: txHash,
      transactionUrl: getBlockExplorerUrl(txHash, explorerConfig),
      waitForConfirmation: async () => {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
          timeout: 180_000,
        });
        log.info("LightUp confirmed", { hash: txHash });
        return {
          transactionHash: txHash,
          transactionUrl: getBlockExplorerUrl(txHash, explorerConfig),
          receipt,
        };
      },
    };
  }, [wallet]);

  return {
    baseTokenAddress,
    burnAmount,
    currentStage,
    isLoadingConfig,
    canLightUp,
    executeLightUpTx,
  };
}

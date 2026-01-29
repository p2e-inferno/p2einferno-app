/**
 * Deploy Lock Task Form Component
 *
 * Dedicated form for submitting Unlock Protocol lock deployment transaction hashes.
 * Displays allowed networks, reward multipliers, and handles automatic verification.
 */

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
  Network,
} from "lucide-react";
import {
  type DeployLockTaskConfig,
  getNetworkDisplayName,
  calculateRewardAmount,
  getErrorMessage,
} from "@/lib/quests/verification/deploy-lock-utils";

interface DeployLockTaskFormProps {
  /** Quest task ID */
  taskId: string;
  /** Quest ID */
  questId: string;
  /** Task configuration from task_config JSONB */
  taskConfig: DeployLockTaskConfig;
  /** Base reward amount before multiplier */
  baseReward: number;
  /** Whether the task is already completed */
  isCompleted?: boolean;
  /** Whether the quest has been started */
  isQuestStarted?: boolean;
  /** Callback when submission is successful */
  onSuccess?: (verificationData: Record<string, unknown>) => void;
  /** Callback for submitting the transaction hash */
  onSubmit?: (transactionHash: string) => Promise<void>;
}

/**
 * Get block explorer URL for a transaction
 */
const getBlockExplorerUrl = (
  chainId: number,
  txHash: string,
): string | null => {
  const explorers: Record<number, string> = {
    8453: "https://basescan.org/tx/",
    84532: "https://sepolia.basescan.org/tx/",
    10: "https://optimistic.etherscan.io/tx/",
    42161: "https://arbiscan.io/tx/",
    42220: "https://celoscan.io/tx/",
  };

  return explorers[chainId] ? `${explorers[chainId]}${txHash}` : null;
};

export const DeployLockTaskForm: React.FC<DeployLockTaskFormProps> = ({
  taskId,
  questId,
  taskConfig,
  baseReward,
  isCompleted = false,
  isQuestStarted = true,
  onSuccess,
  onSubmit,
}) => {
  const [txHash, setTxHash] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(
    null,
  );
  const [success, setSuccess] = useState(false);
  const [verificationData, setVerificationData] = useState<{
    chainId: number;
    lockAddress: string;
    rewardMultiplier: number;
    networkName: string;
    transactionHash: string;
  } | null>(null);

  const allowedNetworks = taskConfig.allowed_networks.filter((n) => n.enabled);

  // Client-side transaction hash validation
  const validateTxHash = (hash: string): boolean => {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!validateTxHash(txHash)) {
      setError({
        code: "INVALID_TX_HASH",
        message: getErrorMessage("INVALID_TX_HASH"),
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // If onSubmit callback provided, use it
      if (onSubmit) {
        await onSubmit(txHash);
        setSuccess(true);
        return;
      }

      // Otherwise, make API call directly
      const response = await fetch("/api/quests/complete-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questId,
          taskId,
          verificationData: { transactionHash: txHash },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError({ code: data.code || "UNKNOWN_ERROR", message: data.error });
        return;
      }

      // Success!
      const vData = data.completion?.verification_data;
      if (vData) {
        setVerificationData({
          chainId: vData.chainId,
          lockAddress: vData.lockAddress,
          rewardMultiplier: vData.rewardMultiplier,
          networkName: vData.networkName,
          transactionHash: vData.transactionHash,
        });
      }
      setSuccess(true);
      onSuccess?.(vData);
    } catch (err) {
      setError({
        code: "NETWORK_ERROR",
        message:
          "Failed to submit. Please check your connection and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCompleted) {
    return (
      <div className="bg-green-900/20 border border-green-700 rounded-lg p-4">
        <div className="flex items-center text-green-400 mb-2">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          <span className="font-semibold">Lock Deployment Verified!</span>
        </div>
        <p className="text-gray-300 text-sm">
          Your lock deployment has been successfully verified.
        </p>
      </div>
    );
  }

  if (success && verificationData) {
    const finalReward = Math.floor(
      baseReward * verificationData.rewardMultiplier,
    );
    const explorerUrl = getBlockExplorerUrl(
      verificationData.chainId,
      verificationData.transactionHash,
    );

    return (
      <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 space-y-3">
        <div className="flex items-center text-green-400 mb-2">
          <CheckCircle2 className="w-5 h-5 mr-2" />
          <span className="font-bold">Lock Deployment Verified!</span>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Network:</span>
            <span className="text-white font-medium">
              {verificationData.networkName}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-gray-400">Lock Address:</span>
            <div className="flex items-center gap-2">
              <code className="text-white font-mono text-xs">
                {verificationData.lockAddress.slice(0, 6)}...
                {verificationData.lockAddress.slice(-4)}
              </code>
              {explorerUrl && (
                <a
                  href={explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">Reward:</span>
            <span className="text-green-400 font-bold">
              {finalReward} DG
              {verificationData.rewardMultiplier !== 1.0 && (
                <span className="text-gray-400 text-xs ml-1">
                  ({verificationData.rewardMultiplier}x multiplier)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Network Information */}
      <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
        <div className="flex items-center text-blue-400 mb-1">
          <Network className="w-5 h-5 mr-2" />
          <span className="font-semibold">Accepted Networks</span>
        </div>
        <p className="text-xs text-blue-300/60 mb-3">
          Each network has a different reward multiplier. Choose your network
          wisely!
        </p>
        <div className="space-y-2">
          {allowedNetworks.map((net) => {
            const reward = calculateRewardAmount(
              baseReward,
              net.chain_id,
              taskConfig,
            );
            return (
              <div
                key={net.chain_id}
                className="flex justify-between items-center text-sm"
              >
                <span className="text-gray-300">
                  {getNetworkDisplayName(net.chain_id)}
                </span>
                <span className="text-orange-400 font-semibold">
                  {reward} DG
                  {net.reward_ratio !== 1.0 && (
                    <span className="text-gray-500 text-xs ml-1">
                      ({net.reward_ratio}x)
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Transaction Hash Input */}
      <div className="space-y-2">
        <Label htmlFor="tx-hash" className="text-gray-300">
          Deployment Transaction Hash
        </Label>
        <Input
          id="tx-hash"
          type="text"
          value={txHash}
          onChange={(e) => setTxHash(e.target.value)}
          placeholder="0x..."
          pattern="^0x[a-fA-F0-9]{64}$"
          required
          disabled={!isQuestStarted || isSubmitting}
          className="bg-gray-800 border-gray-700 text-gray-100 font-mono"
          aria-describedby="tx-hash-help"
        />
        <p id="tx-hash-help" className="text-gray-500 text-xs">
          Paste the transaction hash from your lock deployment
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <div
          className="bg-red-900/20 border border-red-700 rounded-lg p-4"
          role="alert"
        >
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-300 font-semibold mb-1">{error.message}</p>
              {error.code === "TX_NOT_FOUND_MULTI_NETWORK" && (
                <p className="text-red-400 text-sm">
                  Make sure you deployed to one of the accepted networks above.
                </p>
              )}
              {error.code === "TX_ALREADY_USED" && (
                <p className="text-red-400 text-sm">
                  Each transaction can only be used once. Deploy a new lock.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        disabled={!isQuestStarted || isSubmitting || !txHash}
        className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-bold py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Verifying on {allowedNetworks.length} network(s)...
          </>
        ) : (
          "Submit Deployment"
        )}
      </Button>

      {!isQuestStarted && (
        <p className="text-gray-500 text-sm text-center">
          You must start the quest before submitting tasks
        </p>
      )}
    </form>
  );
};

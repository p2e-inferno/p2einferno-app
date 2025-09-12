import { useCallback, useState } from "react";
import { formatCurrency, type Currency } from "../../lib/payment-utils";
import { AlertCircle, Wallet, X } from "lucide-react";
import { useWallets } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { unlockUtils } from "../../lib/unlock/lockUtils";
import { getClientConfig } from "../../lib/blockchain/config/unified-config";
import { LoadingButton } from "../ui/loading-button";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("payment:BlockchainPayment");

interface BlockchainPaymentProps {
  applicationId: string;
  cohortId: string;
  lockAddress: string;
  amount: number;
  currency: Currency;
  email: string;
  onSuccess?: () => void;
  disabled?: boolean;
}

interface PaymentData {
  reference: string;
  lockAddress: string;
  cohortTitle: string;
}

export function BlockchainPayment({
  applicationId,
  cohortId,
  amount,
  currency,
  email,
  disabled,
}: BlockchainPaymentProps) {
  const { wallets } = useWallets();
  const wallet = useSmartWalletSelection() as any;

  if (typeof window !== "undefined") {
    // Log wallet selection for debugging
    log.info("[BlockchainPayment] Selected wallet:", {
      address: wallet?.address,
      walletClientType: wallet?.walletClientType,
      connectorType: wallet?.connectorType,
      type: wallet?.type,
      availableWallets: wallets?.map((w) => ({
        address: w.address,
        type: w.walletClientType || w.connectorType,
      })),
    });
  }
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pollingProgress, setPollingProgress] = useState({
    current: 0,
    total: 0,
  });
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const initializePayment = async () => {
    if (!wallet?.address) {
      toast.error("Please connect your wallet first");
      return;
    }

    setIsLoading(true);
    setError(null);
    toast.loading("Initializing blockchain payment...", { id: "payment-init" });

    try {
      const response = await fetch("/api/payment/blockchain/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId,
          cohortId,
          amount,
          currency,
          email,
          walletAddress: wallet.address,
          chainId: wallet.chainId?.split(":")[1]
            ? parseInt(wallet.chainId.split(":")[1]!, 10)
            : getClientConfig().chain.id,
        }),
      });
      const result = await response.json();
      if (!result.success)
        throw new Error(result.error || "Failed to initialize payment");
      setPaymentData(result.data);
      toast.success("Ready to purchase.", { id: "payment-init" });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Payment initialization failed";
      setError(errorMessage);
      toast.error(`❌ ${errorMessage}`, { id: "payment-init" });
    } finally {
      setIsLoading(false);
    }
  };

  const executePurchase = async () => {
    if (!paymentData || !wallet?.address) {
      toast.error("Missing payment data or wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);
    toast.loading("Please confirm the transaction in your wallet...", {
      id: "payment-tx",
    });

    try {
      const purchaseResult = await unlockUtils.purchaseKey(
        paymentData.lockAddress,
        wallet,
      );

      if (!purchaseResult.success || !purchaseResult.transactionHash) {
        throw new Error(purchaseResult.error || "Purchase failed in wallet");
      }

      setTransactionHash(purchaseResult.transactionHash);
      toast.loading("Transaction sent! Verifying on-chain...", {
        id: "payment-tx",
      });

      // Invoke the Edge Function to handle verification in the background
      const verifyResponse = await fetch("/api/payment/blockchain/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionHash: purchaseResult.transactionHash,
          applicationId,
          paymentReference: paymentData.reference,
        }),
      });

      if (!verifyResponse.ok) {
        throw new Error("Failed to start verification process.");
      }

      setIsProcessing(true);
      setPollingProgress({ current: 0, total: 0 });
      toast.success(
        "Verification started! We'll redirect once it's confirmed.",
        { id: "payment-tx", duration: 6000 },
      );

      // Begin polling for verification completion, similar to Paystack flow
      await pollVerificationStatus(paymentData.reference);
    } catch (err: any) {
      const errorMessage = err.message || "An unknown error occurred.";
      setError(errorMessage);
      toast.error(`❌ ${errorMessage}`, { id: "payment-tx" });
    } finally {
      setIsLoading(false);
    }
  };

  const resetPayment = () => {
    setPaymentData(null);
    setError(null);
    setTransactionHash(null);
    setIsProcessing(false);
  };

  const pollVerificationStatus = useCallback(
    async (reference: string) => {
      // Edge function polls up to ~60s; give a small grace period
      const maxPollingTime = 70000; // 70 seconds total
      const pollInterval = 1000; // every 1s
      const maxAttempts = Math.floor(maxPollingTime / pollInterval);

      setPollingProgress({ current: 0, total: maxAttempts });

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        setPollingProgress({ current: attempt, total: maxAttempts });
        try {
          const resp = await fetch(
            `/api/payment/blockchain/status/${reference}`,
          );
          const data = await resp.json();
          if (data?.success && data?.status === "success") {
            // Verified — redirect like Paystack flow
            window.location.href = "/lobby";
            return;
          }
          if (data?.status === "failed") {
            throw new Error("Blockchain verification failed.");
          }
        } catch (e) {
          // soft-fail and continue unless last attempt or explicit failure
          if (attempt === maxAttempts) {
            setError(
              "Payment verification timeout. If funds left your wallet, please contact support with your transaction hash.",
            );
            setIsProcessing(false);
            return;
          }
        }

        // wait
        await new Promise((r) => setTimeout(r, pollInterval));
      }

      // Reached attempts without success
      setIsProcessing(false);
      setError(
        "Payment verification timeout. If funds left your wallet, please contact support with your transaction hash.",
      );
    },
    [setPollingProgress],
  );

  if (isProcessing) {
    return (
      <div className="text-center p-8 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-center mb-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
          <div className="flex space-x-1">
            <div
              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
              style={{ animationDelay: "0ms" }}
            ></div>
            <div
              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
              style={{ animationDelay: "150ms" }}
            ></div>
            <div
              className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
              style={{ animationDelay: "300ms" }}
            ></div>
          </div>
        </div>
        <h3 className="font-bold text-blue-800 mb-2 text-xl">
          Verification in Progress
        </h3>
        <p className="text-blue-700 mb-3">
          Your transaction is being verified on-chain. This can take up to about
          a minute.
        </p>
        <div className="bg-blue-100 rounded-lg p-3 mb-3">
          <p className="text-blue-800 text-sm font-medium mb-2">
            What’s happening:
          </p>
          <p className="text-blue-700 text-xs mb-3">
            • Transaction submitted ✓<br />
            • Waiting for blockchain confirmation...
            <br />• Finalizing enrollment...
          </p>
          {pollingProgress.total > 0 && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-blue-700 mb-1">
                <span>Verification Progress</span>
                <span>
                  {pollingProgress.current} / {pollingProgress.total}
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${(pollingProgress.current / pollingProgress.total) * 100}%`,
                  }}
                ></div>
              </div>
              <p className="text-xs text-blue-600 mt-1">
                Estimated time:{" "}
                {Math.max(
                  0,
                  Math.floor(pollingProgress.total - pollingProgress.current),
                )}
                s remaining
              </p>
            </div>
          )}
        </div>
        {transactionHash && (
          <p className="text-xs font-mono text-blue-600 break-all">
            Tx: {transactionHash}
          </p>
        )}
        <p className="text-blue-600 text-xs mt-2">
          Please don’t refresh. You’ll be redirected automatically once
          verified.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!paymentData ? (
        <LoadingButton
          onClick={initializePayment}
          loading={isLoading}
          disabled={disabled || !wallet}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200"
        >
          <Wallet className="w-5 h-5 mr-2" />
          {isLoading ? "Initializing..." : "Pay with Crypto"}
        </LoadingButton>
      ) : (
        <div className="p-6 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 text-lg">
              Confirm Purchase
            </h3>
            <button
              onClick={resetPayment}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            You are about to purchase access to &quot;{paymentData.cohortTitle}
            &quot; for {formatCurrency(amount, currency)} on the{" "}
            {getClientConfig().networkName} network.
          </p>
          <LoadingButton
            onClick={executePurchase}
            loading={isLoading}
            disabled={disabled}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg"
          >
            {isLoading ? "Awaiting Confirmation..." : "Confirm Purchase"}
          </LoadingButton>
        </div>
      )}
      {error && (
        <div
          className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800 text-sm flex items-start gap-2 overflow-x-auto"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <span className="break-all whitespace-pre-wrap">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-500/70 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-300 rounded"
            aria-label="Dismiss error"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

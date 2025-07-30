import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { formatCurrency, type Currency } from "../../lib/payment-utils";
import { AlertCircle, Wallet, X, RefreshCw } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { unlockUtils } from "../../lib/unlock/lockUtils";
import { CHAIN_CONFIG } from "../../lib/blockchain/config";
import { SuccessScreen } from "../ui/SuccessScreen";
import { LoadingOverlay } from "../ui/loading-overlay";

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

interface PaymentResult {
  success: boolean;
  transactionHash: string | null;
  keyTokenId?: string;
}

export function BlockchainPayment({
  applicationId,
  cohortId,
  lockAddress,
  amount,
  currency,
  email,
  onSuccess,
  disabled,
}: BlockchainPaymentProps) {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isReconciling, setIsReconciling] = useState(true);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);

  // New states for handling verification failures
  const [verificationFailed, setVerificationFailed] = useState(false);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  // Safety Net: Check for existing key on page load
  useEffect(() => {
    const checkExistingKey = async () => {
      if (!wallet?.address || !lockAddress) {
        setIsReconciling(false);
        return;
      }

      try {
        const hasKey = await unlockUtils.checkKeyOwnership(
          lockAddress,
          wallet.address
        );

        if (hasKey) {
          toast.loading("We found your key! Syncing your status...", {
            id: "reconcile-toast",
          });
          const response = await fetch("/api/payment/blockchain/reconcile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              applicationId,
              walletAddress: wallet.address,
            }),
          });
          if (!response.ok)
            throw new Error("Failed to sync your payment status.");
          toast.success("Sync complete! Redirecting...", {
            id: "reconcile-toast",
          });
          onSuccess?.();
        } else {
          setIsReconciling(false);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not verify your key.",
          { id: "reconcile-toast" }
        );
        setIsReconciling(false);
      }
    };
    checkExistingKey();
  }, [wallet?.address, lockAddress, applicationId, onSuccess]);

  const initializePayment = async () => {
    if (!wallet?.address) {
      const errorMsg = "Please connect your wallet first";
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsLoading(true);
    setError(null);
    setVerificationFailed(false);
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
        }),
      });
      const result = await response.json();
      if (!result.success)
        throw new Error(result.error || "Failed to initialize payment");
      setPaymentData(result.data);
      toast.success("Payment initialized! Ready to purchase.", {
        id: "payment-init",
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Payment initialization failed";
      setError(errorMessage);
      toast.error(`❌ ${errorMessage}`, { id: "payment-init" });
    } finally {
      setIsLoading(false);
    }
  };

  const executePurchase = async (isRetry = false) => {
    if (!isRetry && (!paymentData || !wallet?.address)) {
      const errorMsg = "Missing payment data or wallet not connected";
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsLoading(true);
    setError(null);
    setVerificationFailed(false);
    toast.loading("Processing transaction...", { id: "payment-tx" });

    try {
      let purchaseTxHash = transactionHash;

      // Only execute on-chain transaction if it's not a retry
      if (!isRetry) {
        toast.loading("Purchasing key...", { id: "payment-tx" });
        const purchaseResult = await unlockUtils.purchaseKey(
          paymentData!.lockAddress,
          wallet
        );
        if (!purchaseResult.success || !purchaseResult.transactionHash) {
          throw new Error(purchaseResult.error || "Purchase failed");
        }
        setTransactionHash(purchaseResult.transactionHash);
        purchaseTxHash = purchaseResult.transactionHash;
      }

      toast.loading("Verifying transaction...", { id: "payment-tx" });
      const verifyResponse = await fetch("/api/payment/blockchain/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionHash: purchaseTxHash,
          applicationId,
          paymentReference: paymentData!.reference,
        }),
      });
      const verifyResult = await verifyResponse.json();
      if (!verifyResponse.ok) {
        setVerificationFailed(true);
        throw new Error(verifyResult.error || "Payment verification failed");
      }
      setResult({
        success: true,
        transactionHash: purchaseTxHash,
        keyTokenId: verifyResult.data.keyTokenId,
      });
      setError(null);
      toast.success("🎉 Payment successful! NFT key minted!", {
        id: "payment-tx",
        duration: 5000,
      });
      onSuccess?.();
    } catch (err: any) {
      const errorMessage = err.message || "An unknown error occurred.";
      setError(errorMessage);
      if (verificationFailed) {
        toast.error(`Verification failed. Please retry.`, {
          id: "payment-tx",
        });
      } else {
        toast.error(`❌ ${errorMessage}`, { id: "payment-tx" });
        // Record failed on-chain attempt
        try {
          await fetch("/api/payment/blockchain/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transactionHash: null,
              applicationId,
              paymentReference: paymentData!.reference,
              failed: true,
              errorMessage,
            }),
          });
        } catch (dbError) {
          console.error("Failed to record payment failure:", dbError);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetPayment = () => {
    setPaymentData(null);
    setResult(null);
    setError(null);
    setVerificationFailed(false);
    setTransactionHash(null);
  };

  const handleRedirectToLobby = async () => {
    await router.push("/lobby");
  };

  if (!authenticated) {
    return (
      <div className="text-center p-8 bg-yellow-50 rounded-lg border border-yellow-200">
        <Wallet className="w-16 h-16 text-yellow-600 mx-auto mb-4" />
        <h3 className="font-bold text-yellow-800 mb-2 text-xl">
          Connect Wallet Required
        </h3>
        <p className="text-yellow-700 mb-4">
          Please connect your wallet to proceed with blockchain payment.
        </p>
      </div>
    );
  }

  if (isReconciling) {
    return (
      <LoadingOverlay
        isLoading={true}
        message="Checking your membership status..."
      >
        <></>
      </LoadingOverlay>
    );
  }

  if (result?.success) {
    const explorerUrl = unlockUtils.getBlockExplorerUrl(
      result.transactionHash!
    );
    return (
      <SuccessScreen
        title="🎉 Payment Successful!"
        message="Your NFT key has been minted to your wallet!"
        transactionHash={result.transactionHash || undefined}
        keyTokenId={result.keyTokenId}
        blockExplorerUrl={explorerUrl}
        countdownSeconds={5}
        onRedirect={handleRedirectToLobby}
        redirectLabel="Return to Lobby"
        showCountdown={true}
      />
    );
  }

  return (
    <div className="space-y-4">
      {!paymentData ? (
        <div className="text-center p-8 bg-blue-50 rounded-lg border border-blue-200">
          <Wallet className="w-16 h-16 text-blue-600 mx-auto mb-4" />
          <h3 className="font-bold text-blue-800 mb-2 text-xl">
            Blockchain Payment
          </h3>
          <p className="text-blue-700 mb-4">
            Pay {formatCurrency(amount, currency)} with cryptocurrency.
          </p>
          <p className="text-sm text-blue-600 mb-4">
            Network: {CHAIN_CONFIG.chain.name} (Chain ID:{" "}
            {CHAIN_CONFIG.chain.id})
          </p>
          <button
            onClick={initializePayment}
            disabled={isLoading || disabled || !wallet}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isLoading ? "Initializing..." : "Initialize Crypto Payment"}
          </button>
        </div>
      ) : (
        <div className="p-6 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-800 text-lg">
              Complete Purchase for {paymentData.cohortTitle}
            </h3>
            <button
              onClick={resetPayment}
              className="text-gray-400 hover:text-gray-600"
              title="Start over"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3 mb-6 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Amount:</span>
              <span className="font-medium">
                {formatCurrency(amount, currency)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Lock Contract:</span>
              <span className="font-mono text-xs break-all">
                {paymentData.lockAddress}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Your Wallet:</span>
              <span className="font-mono text-xs break-all">
                {wallet?.address}
              </span>
            </div>
          </div>
          <button
            onClick={() => executePurchase(false)}
            disabled={isLoading || disabled || verificationFailed}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isLoading
              ? "Processing Transaction..."
              : "Purchase Key with Crypto"}
          </button>
        </div>
      )}

      {verificationFailed && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
          <RefreshCw className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
          <h4 className="font-bold text-yellow-800 mb-1">
            Verification Needed
          </h4>
          <p className="text-sm text-yellow-700 mb-3">
            Your transaction succeeded on-chain, but we couldn't update your
            status. Please retry verification.
          </p>
          <button
            onClick={() => executePurchase(true)}
            disabled={isLoading}
            className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
          >
            {isLoading ? "Verifying..." : "Retry Verification"}
          </button>
        </div>
      )}

      {error && !verificationFailed && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Error: {error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useRouter } from "next/router";
import { formatCurrency, type Currency } from "../../lib/payment-utils";
import {
  AlertCircle,
  Wallet,
  ExternalLink,
  CheckCircle,
  X,
} from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { unlockUtils } from "../../lib/unlock/lockUtils";
import { CHAIN_CONFIG } from "../../lib/blockchain/config";
import { SuccessScreen } from "../ui/SuccessScreen";

interface BlockchainPaymentProps {
  applicationId: string;
  cohortId: string;
  amount: number;
  currency: Currency;
  email: string;
  lockAddress?: string;
  keyManagers?: string[];
  onSuccess?: () => void;
  disabled?: boolean;
}

interface PaymentData {
  reference: string;
  lockAddress: string;
  cohortTitle: string;
  walletAddress: string;
}

interface PaymentResult {
  success: boolean;
  transactionHash?: string;
  keyTokenId?: string;
  error?: string;
}

export function BlockchainPayment({
  applicationId,
  cohortId,
  amount,
  currency,
  email,
  onSuccess,
  disabled,
}: BlockchainPaymentProps) {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0]; // Use wallets from useWallets() hook
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentResult | null>(null);

  const initializePayment = async () => {
    if (!wallet?.address) {
      const errorMsg = "Please connect your wallet first";
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Show loading toast
    toast.loading("Initializing blockchain payment...", {
      id: "payment-init",
    });

    try {
      const response = await fetch("/api/payment/blockchain/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

      if (!result.success) {
        throw new Error(result.error || "Failed to initialize payment");
      }

      setPaymentData(result.data);

      // Success feedback
      toast.success("Payment initialized! Ready to purchase.", {
        id: "payment-init",
      });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Payment initialization failed";
      setError(errorMessage);
      toast.error(`❌ ${errorMessage}`, {
        id: "payment-init",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const executePurchase = async () => {
    if (!paymentData || !wallet?.address) {
      const errorMsg = "Missing payment data or wallet not connected";
      setError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Show initial processing toast
    toast.loading("Processing transaction...", {
      id: "payment-tx",
    });

    try {
      // Get key price to determine if this is a free or paid purchase
      toast.loading("Getting key price...", {
        id: "payment-tx",
      });

      const keyPrice = await unlockUtils.getKeyPrice(paymentData.lockAddress);
      const priceAmount = parseFloat(keyPrice.priceFormatted);
      const isETH =
        keyPrice.tokenAddress === "0x0000000000000000000000000000000000000000";
      const tokenSymbol = isETH ? "ETH" : "USDC";

      console.log(
        `Purchasing key for ${priceAmount} ${tokenSymbol} (Token: ${keyPrice.tokenAddress})`
      );

      // Update toast for purchase execution
      toast.loading(
        priceAmount === 0
          ? "Minting free key..."
          : `Purchasing key for ${priceAmount} ${tokenSymbol}...`,
        {
          id: "payment-tx",
        }
      );

      // Execute purchase using lockUtils (it will auto-detect ETH vs ERC20)
      const purchaseResult = await unlockUtils.purchaseKey(
        paymentData.lockAddress,
        wallet
      );

      if (!purchaseResult.success) {
        throw new Error(purchaseResult.error || "Purchase failed");
      }

      console.log("Purchase successful:", purchaseResult.transactionHash);

      // Update toast for verification
      toast.loading("Verifying transaction...", {
        id: "payment-tx",
      });

      // Verify the blockchain transaction
      const verifyResponse = await fetch("/api/payment/blockchain/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          transactionHash: purchaseResult.transactionHash,
          applicationId,
          paymentReference: paymentData.reference,
        }),
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResponse.ok) {
        throw new Error(verifyResult.error || "Payment verification failed");
      }

      setResult({
        success: true,
        transactionHash: purchaseResult.transactionHash,
        keyTokenId: verifyResult.keyTokenId,
      });

      setError(null);

      // Show success toast
      toast.success("🎉 Payment successful! NFT key minted!", {
        id: "payment-tx",
        duration: 5000,
      });

      onSuccess?.();
    } catch (err: any) {
      console.error("Purchase failed:", err);

      let errorMessage = "Transaction failed";
      let toastMessage = "❌ Transaction failed";

      if (
        err.message?.includes("User rejected") ||
        err.message?.includes("user rejected")
      ) {
        errorMessage = "Transaction was cancelled by user";
        toastMessage = "🚫 Transaction cancelled by user";
      } else if (err.message?.includes("insufficient funds")) {
        errorMessage = "Insufficient funds for transaction";
        toastMessage =
          "💰 Insufficient funds - please add more USDC to your wallet";
      } else if (err.message?.includes("ERC20: insufficient allowance")) {
        errorMessage = "USDC approval required";
        toastMessage = "💳 Please approve USDC spending and try again";
      } else if (err.message?.includes("network")) {
        errorMessage = "Network error - please try again";
        toastMessage = "🌐 Network error - please try again";
      } else if (err.message) {
        errorMessage = err.message;
        toastMessage = `❌ ${err.message}`;
      }

      setError(errorMessage);

      // Show specific error toast
      toast.error(toastMessage, {
        id: "payment-tx",
        duration: 6000,
      });

      // Record failed payment attempt in database
      try {
        await fetch("/api/payment/blockchain/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            transactionHash: null,
            applicationId,
            paymentReference: paymentData.reference,
            failed: true,
            errorMessage,
          }),
        });
      } catch (dbError) {
        console.error("Failed to record payment failure:", dbError);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetPayment = () => {
    setPaymentData(null);
    setResult(null);
    setError(null);
  };

  const handleRedirectToLobby = async () => {
    try {
      await router.push("/lobby");
    } catch (error) {
      console.error("Failed to redirect to lobby:", error);
      // Fallback: use window.location if router fails
      window.location.href = "/lobby";
    }
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

  if (result?.success) {
    const explorerUrl = unlockUtils.getBlockExplorerUrl(
      result.transactionHash!
    );

    return (
      <SuccessScreen
        title="🎉 Payment Successful!"
        message="Your NFT key has been minted to your wallet!"
        transactionHash={result.transactionHash}
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
            Pay {formatCurrency(amount, currency)} with cryptocurrency directly
            to the lock contract.
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
              <span className="text-gray-600">Network:</span>
              <span className="font-medium">{CHAIN_CONFIG.chain.name}</span>
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
            onClick={executePurchase}
            disabled={isLoading || disabled}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isLoading
              ? "Processing Transaction..."
              : "Purchase Key with Crypto"}
          </button>
        </div>
      )}

      {error && (
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

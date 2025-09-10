import { useState } from "react";
import { useRouter } from "next/router";
import { formatCurrency, type Currency } from "../../lib/payment-utils";
import { AlertCircle, Wallet, X, CheckCircle } from "lucide-react";
import { useWallets } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { unlockUtils } from "../../lib/unlock/lockUtils";
import { getClientConfig } from "../../lib/blockchain/config/unified-config";
import { LoadingButton } from "../ui/loading-button";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

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
  
  if (typeof window !== 'undefined') {
    // Log wallet selection for debugging
    console.log('[BlockchainPayment] Selected wallet:', {
      address: wallet?.address,
      walletClientType: wallet?.walletClientType,
      connectorType: wallet?.connectorType,
      type: wallet?.type,
      availableWallets: wallets?.map(w => ({ address: w.address, type: w.walletClientType || w.connectorType }))
    });
  }
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
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
      toast.success(
        "Verification in progress! You can now leave this page. We'll notify you upon completion.",
        { id: "payment-tx", duration: 8000 },
      );

      // Redirect user to the lobby immediately
      setTimeout(() => {
        router.push("/lobby");
      }, 3000);
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

  if (isProcessing) {
    return (
      <div className="text-center p-8 bg-blue-50 rounded-lg border border-blue-200">
        <CheckCircle className="w-16 h-16 text-blue-600 mx-auto mb-4" />
        <h3 className="font-bold text-blue-800 mb-2 text-xl">
          Verification in Progress
        </h3>
        <p className="text-blue-700 mb-4">
          Your transaction is being verified on the blockchain. You will be
          redirected to the lobby shortly and will receive a notification once
          your enrollment is confirmed.
        </p>
        <p className="text-sm font-mono text-blue-600 break-all">
          Tx: {transactionHash}
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

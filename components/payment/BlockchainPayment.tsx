import { useState } from "react";
import { formatCurrency, type Currency } from "../../lib/payment-utils";
import { AlertCircle, Wallet, ExternalLink, CheckCircle } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { abi as PublicLockABI } from "../../constants/public_lock_abi";

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
  const [isLoading, setIsLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);

  const walletAddress = user?.wallet?.address;

  const initializePayment = async () => {
    if (!walletAddress) {
      setError("Please connect your wallet first");
      return;
    }

    setIsLoading(true);
    setError(null);

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
          walletAddress,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to initialize payment");
      }

      setPaymentData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment initialization failed");
    } finally {
      setIsLoading(false);
    }
  };

  const executePurchase = async () => {
    if (!paymentData || !walletAddress || !window.ethereum) {
      setError("Missing payment data or wallet not connected");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Request account access
      await window.ethereum.request({ method: "eth_requestAccounts" });

      // Switch to Base network (8453)
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x2105" }], // Base mainnet
        });
      } catch (switchError: any) {
        // Network doesn't exist, add it
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x2105",
                chainName: "Base",
                nativeCurrency: {
                  name: "Ether",
                  symbol: "ETH",
                  decimals: 18,
                },
                rpcUrls: ["https://mainnet.base.org"],
                blockExplorerUrls: ["https://basescan.org"],
              },
            ],
          });
        } else {
          throw switchError;
        }
      }

      // Create contract interface
      const { createPublicClient, createWalletClient, custom } = await import("viem");
      const { base } = await import("viem/chains");

      const publicClient = createPublicClient({
        chain: base,
        transport: custom(window.ethereum),
      });

      const walletClient = createWalletClient({
        chain: base,
        transport: custom(window.ethereum),
      });

      // Get key price from contract
      const keyPrice = await publicClient.readContract({
        address: paymentData.lockAddress as `0x${string}`,
        abi: PublicLockABI,
        functionName: "keyPrice",
      });

      // Prepare purchase transaction
      const { request } = await publicClient.simulateContract({
        address: paymentData.lockAddress as `0x${string}`,
        abi: PublicLockABI,
        functionName: "purchase",
        args: [
          [keyPrice], // _values
          [walletAddress as `0x${string}`], // _recipients
          [walletAddress as `0x${string}`], // _referrers
          [walletAddress as `0x${string}`], // _keyManagers
          ["0x"], // _data
        ],
        value: keyPrice as bigint,
        account: walletAddress as `0x${string}`,
      });

      // Execute transaction
      const hash = await walletClient.writeContract(request);
      setTransactionHash(hash);

      // Wait for confirmation
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        // Update payment status
        await fetch(`/api/payment/verify/${paymentData.reference}`, {
          method: "GET",
        });

        setError(null);
        onSuccess?.();
      } else {
        throw new Error("Transaction failed");
      }
    } catch (err: any) {
      console.error("Purchase failed:", err);
      setError(err.message || "Transaction failed");
    } finally {
      setIsLoading(false);
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

  if (transactionHash) {
    return (
      <div className="text-center p-8 bg-green-50 rounded-lg border border-green-200">
        <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
        <h3 className="font-bold text-green-800 mb-2 text-xl">
          Payment Successful!
        </h3>
        <p className="text-green-700 mb-4">
          Your NFT key has been minted to your wallet.
        </p>
        <a
          href={`https://basescan.org/tx/${transactionHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-green-600 hover:text-green-800"
        >
          View Transaction <ExternalLink className="w-4 h-4" />
        </a>
      </div>
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
            Pay {formatCurrency(amount, currency)} with cryptocurrency directly to the lock contract.
          </p>
          <button
            onClick={initializePayment}
            disabled={isLoading || disabled}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isLoading ? "Initializing..." : "Initialize Crypto Payment"}
          </button>
        </div>
      ) : (
        <div className="p-6 bg-white rounded-lg border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4 text-lg">
            Complete Purchase for {paymentData.cohortTitle}
          </h3>
          
          <div className="space-y-3 mb-6 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Amount:</span>
              <span className="font-medium">{formatCurrency(amount, currency)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Lock Contract:</span>
              <span className="font-mono text-xs">{paymentData.lockAddress}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Your Wallet:</span>
              <span className="font-mono text-xs">{walletAddress}</span>
            </div>
          </div>

          <button
            onClick={executePurchase}
            disabled={isLoading || disabled}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg transition duration-200 disabled:opacity-50"
          >
            {isLoading ? "Processing Transaction..." : "Purchase Key with Crypto"}
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

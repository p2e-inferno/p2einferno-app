import { useEffect, useState } from "react";
import { LoadingButton } from "../ui/loading-button";
import { usePayment } from "../../hooks/usePayment";
import { type Currency } from "../../lib/payment-utils";
import { CheckCircle, CreditCard, AlertCircle } from "lucide-react";

interface PaystackPaymentProps {
  applicationId: string;
  amount: number;
  currency: Currency;
  email: string;
  cohortId: string;
  walletAddress?: string;
  onSuccess?: () => void;
  disabled?: boolean;
}

export function PaystackPayment({
  applicationId,
  amount,
  currency,
  email,
  cohortId,
  walletAddress,
  disabled = false,
}: PaystackPaymentProps) {
  const {
    startPayment,
    processPayment,
    isInitializing,
    isConfigured,
    isProcessingPayment,
  } = usePayment({
    applicationId,
    amount,
    currency,
    email,
    cohortId,
    walletAddress,
  });
  const [error, setError] = useState<string | null>(null);
  const [hasProcessed, setHasProcessed] = useState(false);

  const handleInitializePayment = async () => {
    try {
      setError(null);
      await startPayment();
    } catch (err) {
      setError("Failed to initialize payment. Please try again.");
    }
  };

  // Auto-trigger payment flow when configured
  useEffect(() => {
    if (isConfigured && !hasProcessed) {
      try {
        setHasProcessed(true);
        processPayment();
      } catch (err) {
        setError("Failed to process payment. Please try again.");
        setHasProcessed(false);
      }
    }
  }, [isConfigured, processPayment, hasProcessed]);

  if (error) {
    return (
      <div className="space-y-4">
        <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-red-800 font-medium mb-2">Payment Error</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
        <LoadingButton
          onClick={handleInitializePayment}
          loading={isInitializing}
          loadingText="Initializing Payment..."
          disabled={disabled || isInitializing}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
        >
          <CreditCard className="w-5 h-5 mr-2" />
          Try Again
        </LoadingButton>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isConfigured ? (
        <LoadingButton
          onClick={handleInitializePayment}
          loading={isInitializing}
          loadingText="Initializing Payment..."
          disabled={disabled || isInitializing}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-3"
        >
          <CreditCard className="w-5 h-5 mr-2" />
          Pay with Paystack
        </LoadingButton>
      ) : isProcessingPayment ? (
        <div className="text-center p-4 bg-blue-50 rounded-lg">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-blue-800 font-medium">Processing Payment...</p>
          <p className="text-blue-600 text-sm">
            Please wait while we verify your payment
          </p>
        </div>
      ) : (
        <div className="text-center p-4 bg-green-50 rounded-lg">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-green-800 font-medium">
            Payment Initialized Successfully
          </p>
          <p className="text-green-600 text-sm">
            Complete your payment in the Paystack popup
          </p>
        </div>
      )}
    </div>
  );
}

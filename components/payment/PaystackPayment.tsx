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
    pollingProgress,
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
        <div className="text-center p-6 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-center mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
          <h3 className="text-blue-800 font-bold text-lg mb-2">Verifying Your Payment</h3>
          <p className="text-blue-700 mb-3">
            Your payment is being processed. This usually takes 30-45 seconds.
          </p>
          <div className="bg-blue-100 rounded-lg p-3 mb-3">
            <p className="text-blue-800 text-sm font-medium mb-2">What&apos;s happening:</p>
            <p className="text-blue-700 text-xs mb-3">
              • Payment submitted to Paystack ✓<br/>
              • Waiting for confirmation...<br/>
              • Processing enrollment...
            </p>
            {pollingProgress.total > 0 && (
              <div className="mt-2">
                <div className="flex justify-between text-xs text-blue-700 mb-1">
                  <span>Verification Progress</span>
                  <span>{pollingProgress.current} / {pollingProgress.total}</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-1.5">
                  <div 
                    className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" 
                    style={{ width: `${(pollingProgress.current / pollingProgress.total) * 100}%` }}
                  ></div>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Estimated time: {Math.max(0, Math.floor((pollingProgress.total - pollingProgress.current) * 3))}s remaining
                </p>
              </div>
            )}
          </div>
          <p className="text-blue-600 text-xs">
            Please don&apos;t refresh this page. You&apos;ll be redirected automatically once verified.
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

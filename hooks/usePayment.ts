import { useState, useCallback } from "react";
import { usePaystackPayment } from "react-paystack";
import { useApiCall } from "./useApiCall";
import { convertToSmallestUnit, type Currency } from "../lib/payment-utils";
import api from "../lib/api";

interface PaymentConfig {
  applicationId: string;
  amount: number;
  currency: Currency;
  email: string;
  walletAddress?: string;
}

interface PaymentInitResponse {
  reference: string;
  access_code: string;
  authorization_url: string;
}

export const usePayment = (paymentData: PaymentConfig) => {
  const [isInitializing, setIsInitializing] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Initialize payment with backend
  const { execute: initializePayment } = useApiCall({
    onSuccess: (data: PaymentInitResponse) => {
      // Set up Paystack configuration with proper amount in kobo
      const amountInKobo = convertToSmallestUnit(paymentData.amount);

      setPaymentConfig({
        reference: data.reference,
        email: paymentData.email,
        amount: amountInKobo,
        publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY!,
        text: "Pay Now",
        currency: "NGN",
      });
    },
    showErrorToast: true,
  });

  // Verify payment with backend
  const { execute: verifyPayment } = useApiCall({
    onSuccess: (data) => {
      console.log("Payment verified successfully:", data);
      // Use window.location to ensure clean navigation and modal cleanup
      window.location.href = "/lobby";
    },
    showErrorToast: true,
  });

  const initializePaystackPayment = usePaystackPayment(paymentConfig || {});

  const startPayment = useCallback(async () => {
    setIsInitializing(true);

    try {
      await initializePayment(() =>
        api.post("/payment/initialize", paymentData)
      );
    } finally {
      setIsInitializing(false);
    }
  }, [initializePayment]);

  const handlePaymentSuccess = useCallback(
    async (reference: string) => {
      setIsProcessingPayment(true);
      const queryParams = paymentData.walletAddress
        ? `?wallet=${encodeURIComponent(paymentData.walletAddress)}`
        : "";
      await verifyPayment(() =>
        api.get(`/payment/verify/${reference}${queryParams}`)
      );
    },
    [verifyPayment, paymentData.walletAddress]
  );

  const processPayment = useCallback(() => {
    if (paymentConfig && initializePaystackPayment && !isProcessingPayment) {
      initializePaystackPayment({
        onSuccess: async (reference: any) => {
          // Immediately handle the payment success
          await handlePaymentSuccess(reference.reference);
        },
        onClose: () => {
          if (!isProcessingPayment) {
            // Reset the payment config to prevent modal from reopening
            setPaymentConfig(null);
          }
        },
      });
    }
  }, [
    initializePaystackPayment,
    paymentConfig,
    handlePaymentSuccess,
    isProcessingPayment,
  ]);

  return {
    startPayment,
    processPayment,
    isInitializing,
    isConfigured: !!paymentConfig,
    isProcessingPayment,
  };
};

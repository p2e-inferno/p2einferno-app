import { useState, useCallback } from "react";
import { usePaystackPayment } from "react-paystack";
import { useApiCall } from "./useApiCall";
import { convertToSmallestUnit, type Currency } from "../lib/payment-utils";
import api from "../lib/api";
import { useRouter } from "next/navigation";

interface PaymentConfig {
  applicationId: string;
  amount: number;
  currency: Currency;
  email: string;
}

interface PaymentInitResponse {
  reference: string;
  access_code: string;
  authorization_url: string;
}

export const usePayment = (paymentData: PaymentConfig) => {
  const router = useRouter();

  const [isInitializing, setIsInitializing] = useState(false);
  const [paymentConfig, setPaymentConfig] = useState<any>(null);

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
      router.push("/lobby");
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
      await verifyPayment(() => api.get(`/payment/verify/${reference}`));
    },
    [verifyPayment]
  );

  const processPayment = useCallback(() => {
    if (paymentConfig && initializePaystackPayment) {
      initializePaystackPayment({
        onSuccess: (reference: any) => {
          handlePaymentSuccess(reference.reference);
        },
        onClose: () => {
          console.log("Payment dialog closed");
        },
      });
    }
  }, [initializePaystackPayment, paymentConfig, handlePaymentSuccess]);

  return {
    startPayment,
    processPayment,
    isInitializing,
    isConfigured: !!paymentConfig,
  };
};

import { useState, useCallback } from "react";
import { usePaystackPayment } from "react-paystack";
import { useApiCall } from "./useApiCall";
import {
  convertToSmallestUnit,
  type Currency,
} from "../lib/utils/payment-utils";
import api from "../lib/helpers/api";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("hooks:usePayment");

interface PaymentConfig {
  applicationId: string;
  amount: number;
  currency: Currency;
  email: string;
  cohortId: string;
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
  const [pollingProgress, setPollingProgress] = useState({
    current: 0,
    total: 0,
  });

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
      log.info("Payment verified successfully:", data);
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
        api.post("/payment/initialize", paymentData),
      );
    } finally {
      setIsInitializing(false);
    }
  }, [initializePayment]);

  const handlePaymentSuccess = useCallback(
    async (reference: string) => {
      setIsProcessingPayment(true);
      const queryParams = paymentData.walletAddress
        ? `?wallet=${encodeURIComponent(paymentData.walletAddress)}&cohortId=${
            paymentData.cohortId
          }`
        : "";

      // Production-ready polling: 30s for webhook + 15s fallback = 45s total
      const maxPollingTime = 45000; // 45 seconds total (30s webhook + 15s fallback)
      const pollInterval = 1000; // Poll every 1 second
      const maxAttempts = Math.floor(maxPollingTime / pollInterval);

      log.info(`Starting webhook polling for payment ${reference}`);
      log.info(
        `Will poll ${maxAttempts} times over ${maxPollingTime / 1000} seconds`,
      );

      // Initialize progress
      setPollingProgress({ current: 0, total: maxAttempts });

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Update progress
        setPollingProgress({ current: attempt, total: maxAttempts });
        try {
          log.info(
            `Polling attempt ${attempt}/${maxAttempts} - waiting for webhook...`,
          );

          const response = await api.get(
            `/payment/verify/${reference}${queryParams}`,
            { timeout: 60000 }, // 60 seconds to allow server to complete payment processing and key granting
          );

          // Check if webhook has updated the status
          if (response.data?.success) {
            log.info("Webhook processed successfully! Payment verified.");
            await verifyPayment(() => Promise.resolve(response));
            break;
          } else if (response.data?.data?.status === "failed") {
            log.info("Payment failed according to webhook");
            throw new Error("Payment failed");
          } else {
            // Still pending, continue polling
            log.info(
              `Status: ${response.data?.data?.status || "pending"} - continuing to poll...`,
            );
          }

          if (attempt === maxAttempts) {
            throw new Error(
              "Payment verification timeout. Please contact support if payment was successful.",
            );
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        } catch (error: any) {
          // If it's a timeout error, throw it
          if (
            attempt === maxAttempts ||
            error.message.includes("timeout") ||
            error.message.includes("failed")
          ) {
            throw error;
          }

          // For network errors, continue polling
          log.info(`Network error on attempt ${attempt}, continuing...`);
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }
      }
    },
    [verifyPayment, paymentData.walletAddress, paymentData.cohortId],
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
    pollingProgress,
  };
};

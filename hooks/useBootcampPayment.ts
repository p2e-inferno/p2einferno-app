import { useState, useCallback } from "react";
import { getAccessToken } from "@privy-io/react-auth";
import { useVerifyToken } from "./useVerifyToken";

interface PaymentData {
  bootcampId: string;
  amount: number;
  currency: string;
}

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
  redirectUrl?: string;
}

export function useBootcampPayment() {
  const { verifyToken, verifyResult } = useVerifyToken();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResult, setPaymentResult] = useState<PaymentResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const initiatePayment = useCallback(
    async (paymentData: PaymentData) => {
      setIsProcessing(true);
      setError(null);
      setPaymentResult(null);

      try {
        // Step 1: Verify user token before payment
        await verifyToken();

        if (!verifyResult?.valid) {
          throw new Error("Invalid authentication. Please log in again.");
        }

        // Step 2: Get fresh access token for payment request
        const accessToken = await getAccessToken();

        // Step 3: Initiate secure payment on backend
        const response = await fetch("/api/payments/initiate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            bootcampId: paymentData.bootcampId,
            amount: paymentData.amount,
            currency: paymentData.currency,
            // Include user verification data
            tokenVerification: verifyResult,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Payment initiation failed");
        }

        setPaymentResult(result);
      } catch (err: any) {
        setError(err.message || "Payment failed");
      } finally {
        setIsProcessing(false);
      }
    },
    [verifyToken, verifyResult]
  );

  const validatePaymentEligibility = useCallback(
    async (bootcampId: string) => {
      try {
        // Verify token first
        await verifyToken();

        if (!verifyResult?.valid) {
          return { eligible: false, reason: "Authentication required" };
        }

        const accessToken = await getAccessToken();

        // Check if user is eligible for this payment
        const response = await fetch(
          `/api/payments/eligibility/${bootcampId}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        return await response.json();
      } catch (err: any) {
        return {
          eligible: false,
          reason: err.message || "Eligibility check failed",
        };
      }
    },
    [verifyToken, verifyResult]
  );

  return {
    isProcessing,
    paymentResult,
    error,
    initiatePayment,
    validatePaymentEligibility,
  };
}

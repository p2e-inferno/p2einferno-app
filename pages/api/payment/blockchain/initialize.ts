import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import {
  generatePaymentReference,
  validatePaymentAmount,
  type Currency,
} from "../../../../lib/payment-utils";

interface BlockchainPaymentRequest {
  applicationId: string;
  cohortId: string;
  amount: number;
  currency: Currency;
  email: string;
  walletAddress: string; // Required for crypto payments
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const supabaseAdmin = createAdminClient();

  try {
    const {
      applicationId,
      cohortId,
      amount,
      currency,
      email,
      walletAddress,
    }: BlockchainPaymentRequest = req.body;

    // Validate required fields
    if (
      !applicationId ||
      !cohortId ||
      !amount ||
      !currency ||
      !email ||
      !walletAddress
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: applicationId, cohortId, amount, currency, email, walletAddress",
      });
    }

    // Blockchain only handles USD payments
    if (currency !== "USD") {
      return res.status(400).json({
        error: "Blockchain payment only supports USD. Use Paystack for NGN.",
      });
    }

    // Validate wallet address
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({
        error: "Invalid wallet address format",
      });
    }

    // Validate amount
    if (!validatePaymentAmount(amount, currency)) {
      return res.status(400).json({
        error: `Invalid amount. Minimum is $1 for blockchain payments`,
      });
    }

    // Check if application exists and get cohort details
    const { data: application, error: appError } = await supabaseAdmin
      .from("applications")
      .select(
        `
        id, 
        user_email, 
        payment_status,
        cohorts!inner(
          id,
          lock_address,
          name,
          usdt_amount
        )
      `
      )
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({
        error: "Application not found",
      });
    }

    // Check if payment is already completed
    if (application.payment_status === "completed") {
      return res.status(400).json({
        error: "Payment already completed for this application",
      });
    }

    const cohort = Array.isArray(application.cohorts)
      ? application.cohorts[0]
      : application.cohorts;

    if (!cohort) {
      return res.status(404).json({
        error: "Cohort not found contact support.",
      });
    }

    if (cohort.usdt_amount !== amount) {
      return res.status(400).json({
        error: "Invalid amount. Please use the correct amount for this cohort.",
      });
    }

    // Verify cohort has lock address configured
    if (!cohort?.lock_address) {
      return res.status(400).json({
        error: "Cohort lock address not configured. Contact support.",
      });
    }

    // Generate payment reference
    const reference = generatePaymentReference();

    // Save payment transaction to database
    const { error: transactionError } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        application_id: applicationId,
        payment_reference: reference,
        amount,
        currency,
        amount_in_kobo: Math.round(amount * 100),
        status: "pending",
        payment_method: "blockchain",
        metadata: {
          applicationId,
          walletAddress,
          paymentType: "blockchain",
          lockAddress: cohort?.lock_address,
        },
      });

    if (transactionError) {
      console.error(
        "Failed to save blockchain payment transaction:",
        transactionError
      );
      return res.status(500).json({
        error: "Failed to save payment transaction",
      });
    }

    // Update application status
    await supabaseAdmin
      .from("applications")
      .update({ payment_status: "pending" })
      .eq("id", applicationId);

    res.status(200).json({
      success: true,
      data: {
        reference,
        paymentMethod: "blockchain",
        currency,
        amount,
        lockAddress: cohort?.lock_address,
        cohortTitle: cohort?.name,
        walletAddress, // Purchaser's wallet
        instructions: {
          step1: "Connect your wallet to Base network",
          step2: "Call purchase() on the lock contract",
          step3: "Key NFT will be automatically minted to your wallet",
        },
      },
    });
  } catch (error) {
    console.error("Blockchain payment initialization error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

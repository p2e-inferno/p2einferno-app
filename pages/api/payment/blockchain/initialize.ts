import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
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
  walletAddress: string;
  chainId: number; // NEW: Added chainId
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
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
      chainId, // NEW: Destructure chainId
    }: BlockchainPaymentRequest = req.body;

    // Validate required fields
    if (
      !applicationId ||
      !cohortId ||
      !amount ||
      !currency ||
      !email ||
      !walletAddress ||
      !chainId
    ) {
      return res.status(400).json({
        error: "Missing required fields, including chainId.",
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
      return res
        .status(400)
        .json({
          error: `Invalid amount. Minimum is $1 for blockchain payments`,
        });
    }

    // Check application and cohort details
    const { data: application, error: appError } = await supabaseAdmin
      .from("applications")
      .select(
        `id, payment_status, cohorts!inner(id, lock_address, name, usdt_amount)`,
      )
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({ error: "Application not found" });
    }
    if (application.payment_status === "completed") {
      return res
        .status(400)
        .json({ error: "Payment already completed for this application" });
    }

    const cohort = Array.isArray(application.cohorts) ? application.cohorts[0] : application.cohorts;
    if (!cohort || cohort.usdt_amount !== amount) {
      return res.status(400).json({ error: "Invalid amount for this cohort." });
    }
    if (!cohort.lock_address) {
      return res
        .status(400)
        .json({
          error: "Cohort lock address not configured. Contact support.",
        });
    }

    // Generate payment reference
    const reference = generatePaymentReference();

    // Save payment transaction, now including chainId
    const { error: transactionError } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        application_id: applicationId,
        payment_reference: reference,
        amount,
        currency,
        status: "pending",
        payment_method: "blockchain",
        network_chain_id: chainId, // NEW: Store the chainId
        metadata: {
          applicationId,
          walletAddress,
          paymentType: "blockchain",
          lockAddress: cohort.lock_address,
        },
      });

    if (transactionError) {
      console.error(
        "Failed to save blockchain payment transaction:",
        transactionError,
      );
      return res
        .status(500)
        .json({ error: "Failed to save payment transaction" });
    }

    res.status(200).json({
      success: true,
      data: {
        reference,
        lockAddress: cohort.lock_address,
        cohortTitle: cohort.name,
      },
    });
  } catch (error) {
    console.error("Blockchain payment initialization error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

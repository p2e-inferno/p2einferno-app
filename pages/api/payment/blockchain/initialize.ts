import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  generatePaymentReference,
  validatePaymentAmount,
  type Currency,
} from "../../../../lib/payment-utils";

const log = getLogger("api:payment:blockchain:initialize");

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
      return res.status(400).json({
        error: `Invalid amount. Minimum is $1 for blockchain payments`,
      });
    }

    // Check application and cohort details
    const { data: application, error: appError } = await supabaseAdmin
      .from("applications")
      .select(
        `id, user_email, user_profile_id, payment_status, cohort_id, cohorts!inner(id, lock_address, name, usdt_amount, bootcamp_program_id)`,
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

    const cohort = Array.isArray(application.cohorts)
      ? application.cohorts[0]
      : application.cohorts;
    if (!cohort || cohort.usdt_amount !== amount) {
      return res.status(400).json({ error: "Invalid amount for this cohort." });
    }
    if (!cohort.lock_address) {
      return res.status(400).json({
        error: "Cohort lock address not configured. Contact support.",
      });
    }

    // Guard: Prevent payment if user is already enrolled in this bootcamp
    let userProfileId = (application as any).user_profile_id as string | null;
    if (!userProfileId && (application as any).user_email) {
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("id")
        .eq("email", (application as any).user_email)
        .maybeSingle();
      userProfileId = profile?.id || null;
    }

    if (userProfileId) {
      const { data: enrollments, error: enrollErr } = await supabaseAdmin
        .from("bootcamp_enrollments")
        .select("id, cohort:cohort_id ( id, bootcamp_program_id )")
        .eq("user_profile_id", userProfileId);

      if (enrollErr) {
        log.error("Error checking existing enrollments", enrollErr);
        return res
          .status(500)
          .json({ error: "Failed to validate enrollment status" });
      }

      const enrolledInBootcamp = (enrollments || []).some((en: any) => {
        const c = Array.isArray(en.cohort) ? en.cohort[0] : en.cohort;
        return c?.bootcamp_program_id === cohort.bootcamp_program_id;
      });

      if (enrolledInBootcamp) {
        return res.status(409).json({
          error:
            "You are already enrolled in this bootcamp. No additional payment is required.",
        });
      }
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
        amount_in_kobo: 0, // For blockchain (USD) payments, we don't use kobo — set 0.
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
      log.error(
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
    log.error("Blockchain payment initialization error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

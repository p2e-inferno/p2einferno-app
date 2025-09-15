import { NextApiRequest, NextApiResponse } from "next";
// Use the admin Supabase client – this API route runs on the server and
// needs elevated privileges to bypass RLS when inserting payment records.
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import {
  generatePaymentReference,
  convertToSmallestUnit,
  validatePaymentAmount,
  type Currency,
} from "../../../lib/payment-utils";

// Create a fresh instance for this request
const supabase = createAdminClient();
const log = getLogger("api:payment:initialize");

interface InitializePaymentRequest {
  applicationId: string;
  amount: number;
  currency: Currency;
  email: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { applicationId, amount, currency, email }: InitializePaymentRequest =
      req.body;

    // Validate required fields
    if (!applicationId || !amount || !currency || !email) {
      return res.status(400).json({
        error:
          "Missing required fields: applicationId, amount, currency, email",
      });
    }

    // Paystack only handles NGN payments
    if (currency !== "NGN") {
      return res.status(400).json({
        error:
          "Paystack only supports NGN payments. Use blockchain payment for USD.",
      });
    }

    // Validate amount
    if (!validatePaymentAmount(amount, currency)) {
      return res.status(400).json({
        error: `Invalid amount. Minimum is ${
          currency === "NGN" ? "₦10" : "$1"
        }`,
      });
    }

    // Check if application exists and fetch cohort data
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, user_email, user_profile_id, payment_status, cohort_id")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({
        error: "Application not found",
      });
    }

    // Fetch cohort data for pricing validation
    const { data: cohort, error: cohortError } = await supabase
      .from("cohorts")
      .select("naira_amount, usdt_amount, bootcamp_program_id")
      .eq("id", application.cohort_id)
      .single();

    if (cohortError || !cohort) {
      return res.status(404).json({
        error: "Cohort not found",
      });
    }

    // Validate amount against cohort pricing
    const expectedAmount =
      currency === "NGN" ? cohort.naira_amount : cohort.usdt_amount;
    if (!expectedAmount || amount !== expectedAmount) {
      return res.status(400).json({
        error: `Invalid amount. Expected ${currency === "NGN" ? "₦" : "$"}${expectedAmount}`,
      });
    }

    // Check if payment is already completed
    if (application.payment_status === "completed") {
      return res.status(400).json({
        error: "Payment already completed for this application",
      });
    }

    // Guard: Prevent payment if user is already enrolled in this bootcamp (any cohort under same bootcamp_program_id)
    // Resolve user profile id if missing by matching email
    let userProfileId = application.user_profile_id as string | null;
    if (!userProfileId && application.user_email) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id")
        .eq("email", application.user_email)
        .maybeSingle();
      userProfileId = profile?.id || null;
    }

    if (userProfileId) {
      const { data: enrollments, error: enrollErr } = await supabase
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
    const amountInKobo = convertToSmallestUnit(amount);

    // Initialize payment with Paystack
    const paystackResponse = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: amountInKobo,
          currency,
          reference,
          metadata: {
            applicationId,
            custom_fields: [
              {
                display_name: "Application ID",
                variable_name: "application_id",
                value: applicationId,
              },
            ],
          },
          callback_url: `${
            process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
          }/payment/callback`,
        }),
      },
    );

    const paystackData = await paystackResponse.json();
    log.info("paystackData from initialize:: ", paystackData);

    if (!paystackData.status) {
      log.error("Paystack initialization failed:", paystackData);
      return res.status(400).json({
        error: "Payment initialization failed",
        details: paystackData.message,
      });
    }

    const officialReference = paystackData.data.reference || reference;
    log.info("officialReference being saved to database:: ", officialReference);

    // Save payment transaction to database (use Paystack's confirmed reference)
    const { error: transactionError } = await supabase
      .from("payment_transactions")
      .insert({
        application_id: applicationId,
        payment_reference: officialReference,
        paystack_access_code: paystackData.data.access_code,
        amount,
        currency,
        amount_in_kobo: amountInKobo,
        status: "pending",
        metadata: {
          applicationId,
          paystack_response: paystackData.data,
        },
      });

    if (transactionError) {
      log.error("Failed to save payment transaction:", transactionError);
      return res.status(500).json({
        error: "Failed to save payment transaction",
      });
    }

    // Update application with current payment transaction reference
    await supabase
      .from("applications")
      .update({ payment_status: "pending" })
      .eq("id", applicationId);

    res.status(200).json({
      success: true,
      data: {
        reference: officialReference,
        access_code: paystackData.data.access_code,
        authorization_url: paystackData.data.authorization_url,
      },
    });
  } catch (error) {
    log.error("Payment initialization error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

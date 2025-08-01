import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { grantKeyService } from "../../../../lib/blockchain";
import { enrollmentService } from "../../../../lib/services/enrollment-service";
import { StatusSyncService } from "../../../../lib/services/status-sync-service";

const supabase = createAdminClient();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { reference, wallet, cohortId } = req.query;

    if (!reference || typeof reference !== "string") {
      return res.status(400).json({
        error: "Invalid payment reference",
      });
    }
    // Verify payment with Paystack
    const paystackResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    const paystackData = await paystackResponse.json();

    if (!paystackData.status) {
      return res.status(400).json({
        error: "Payment verification failed",
        details: paystackData.message,
      });
    }

    const paymentData = paystackData.data;

    // Update payment transaction in database
    let { data: transactionRows, error: updateError } = await supabase
      .from("payment_transactions")
      .update({
        status: paymentData.status === "success" ? "success" : "failed",
        paystack_status: paymentData.status,
        paystack_gateway_response: paymentData.gateway_response,
        authorization_code: paymentData.authorization?.authorization_code,
        customer_code: paymentData.customer?.customer_code,
        payment_method: paymentData.channel,
        channel: paymentData.channel,
        card_type: paymentData.authorization?.card_type,
        bank: paymentData.authorization?.bank,
        fees: paymentData.fees ? paymentData.fees / 100 : null, // Convert from kobo
        paid_at:
          paymentData.status === "success"
            ? new Date(paymentData.paid_at)
            : null,
        metadata: {
          ...paymentData,
        },
      })
      .eq("payment_reference", reference)
      .select("application_id, status");

    let transaction = Array.isArray(transactionRows)
      ? transactionRows[0]
      : transactionRows;

    if (updateError || !transaction) {
      // Attempt to extract the applicationId from Paystack metadata referrer
      let applicationIdFromReferrer: string | null = null;
      if (
        paymentData?.metadata?.referrer &&
        typeof paymentData.metadata.referrer === "string"
      ) {
        const refMatch = paymentData.metadata.referrer.match(
          /\/payment\/([a-zA-Z0-9-]+)/
        );
        if (refMatch && refMatch[1]) {
          applicationIdFromReferrer = refMatch[1];
        }
      }

      // Fallback: try matching by application_id extracted from referrer
      if (applicationIdFromReferrer) {
        const { data: appRows, error: appErr } = await supabase
          .from("payment_transactions")
          .update({
            status: paymentData.status === "success" ? "success" : "failed",
            paystack_status: paymentData.status,
            paystack_gateway_response: paymentData.gateway_response,
            authorization_code: paymentData.authorization?.authorization_code,
            customer_code: paymentData.customer?.customer_code,
            payment_method: paymentData.channel,
            channel: paymentData.channel,
            card_type: paymentData.authorization?.card_type,
            bank: paymentData.authorization?.bank,
            fees: paymentData.fees ? paymentData.fees / 100 : null,
            paid_at:
              paymentData.status === "success"
                ? new Date(paymentData.paid_at)
                : null,
            metadata: { ...paymentData },
          })
          .eq("application_id", applicationIdFromReferrer)
          .select("application_id, status");

        transaction = Array.isArray(appRows) ? appRows[0] : appRows;
        updateError = appErr;
      }
    }

    if (updateError) {
      console.error("Failed to update payment transaction:", updateError);
      return res.status(500).json({
        error: "Failed to update payment record",
      });
    }

    // If payment was successful, update application status and create enrollment
    if (paymentData.status === "success" && transaction) {
      console.log("Updating application status and creating enrollment");
      
      // Get user profile for status synchronization
      const { data: application, error: appError } = await supabase
        .from("applications")
        .select(`
          id,
          user_email,
          user_profiles!applications_user_email_fkey (
            id
          )
        `)
        .eq("id", transaction.application_id)
        .single();

      if (appError || !application) {
        console.error("Failed to get application:", appError);
        // Fallback to old method
        await supabase
          .from("applications")
          .update({
            payment_status: "completed",
            application_status: "approved",
          })
          .eq("id", transaction.application_id);
      } else {
        const userProfileId = application.user_profiles?.id;
        
        if (userProfileId) {
          // Use status sync service for comprehensive status update
          const statusSyncResult = await StatusSyncService.syncApplicationStatus({
            applicationId: transaction.application_id,
            userProfileId,
            paymentStatus: 'completed',
            applicationStatus: 'approved', // Auto-approve on successful payment
            reason: 'Paystack payment verified'
          });

          if (!statusSyncResult.success) {
            console.error("Failed to sync application status:", statusSyncResult.error);
            // Fallback to old method
            await supabase
              .from("applications")
              .update({
                payment_status: "completed",
                application_status: "approved",
              })
              .eq("id", transaction.application_id);
          }
          
          // Create enrollment for the completed application
          console.log(`Creating enrollment for application ${transaction.application_id}`);
          const enrollmentResult = await enrollmentService.createEnrollmentForCompletedApplication(transaction.application_id);
          
          if (!enrollmentResult.success) {
            console.error("Failed to create enrollment:", enrollmentResult.error);
            // Don't fail the entire verification, just log the error
          } else {
            console.log("Enrollment created successfully:", enrollmentResult.message);
            
            // Update status to enrolled if enrollment was successful
            await StatusSyncService.syncApplicationStatus({
              applicationId: transaction.application_id,
              userProfileId,
              enrollmentStatus: 'active',
              reason: 'Enrollment created after Paystack payment verification'
            });
          }
        }
      }
    }
    // Grant blockchain key if wallet address is provided
    if (wallet && typeof wallet === "string") {
      console.log(`Granting blockchain key to wallet: ${wallet}`);
      const { data: cohort } = await supabase
        .from("cohorts")
        .select("lock_address, key_managers")
        .eq("id", cohortId)
        .single();

      try {
        // Grant key asynchronously - don't block the payment response
        grantKeyService
          .grantKeyToUser({
            walletAddress: wallet,
            lockAddress: cohort.lock_address,
            keyManagers: cohort.key_managers,
          })
          .then((result) => {
            if (result.success) {
              console.log(`Successfully granted key to ${wallet}`, {
                transactionHash: result.transactionHash,
                retryCount: result.retryCount,
              });
            } else {
              console.error(`Failed to grant key to ${wallet}:`, result.error);
            }
          })
          .catch((error) => {
            console.error(`Error granting key to ${wallet}:`, error);
          });
      } catch (error) {
        console.error("Error initiating key grant:", error);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        reference,
        status: paymentData.status,
        amount: paymentData.amount / 100, // Convert from kobo
        currency: paymentData.currency,
        paid_at: paymentData.paid_at,
        walletAddress: wallet,
        customer: {
          email: paymentData.customer?.email,
        },
        authorization: paymentData.authorization
          ? {
              card_type: paymentData.authorization.card_type,
              last4: paymentData.authorization.last4,
              bank: paymentData.authorization.bank,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

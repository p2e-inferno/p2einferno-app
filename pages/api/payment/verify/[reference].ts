// Path: p2einferno-app/pages/api/payment/verify/[reference].ts
import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import axios from "axios";

const supabase = createAdminClient();

// Paystack API verification
async function verifyPaystackTransaction(reference: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Paystack secret key not configured");
  }

  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 second timeout
      }
    );

    return response.data;
  } catch (error) {
    console.error("Paystack verification error:", error);
    throw error;
  }
}

// Manual payment processing when webhook failed but Paystack shows success
async function processPaymentManually(paystackData: any) {
  const applicationId = paystackData.data?.metadata?.applicationId;
  
  if (!applicationId) {
    throw new Error("No applicationId found in Paystack metadata");
  }

  console.log("Manual payment processing for application:", applicationId);

  // Call our database function to process the payment
  const { data, error } = await supabase.rpc('handle_successful_payment', {
    p_application_id: applicationId,
    p_payment_reference: paystackData.data.reference,
    p_payment_method: 'paystack',
    p_transaction_details: paystackData.data
  });

  if (error || !data?.[0]?.success) {
    console.error("Manual payment processing failed:", error || data?.[0]?.message);
    throw new Error(data?.[0]?.message || "Payment processing failed");
  }

  console.log("Manual payment processing successful:", data[0]);
  return data[0];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { reference } = req.query;

    if (!reference || typeof reference !== 'string') {
      return res.status(400).json({ error: "Invalid payment reference" });
    }

    console.log(`Payment verification for reference: ${reference}`);

    // Step 1: Check webhook-updated status in our database
    const { data: transaction, error: dbError } = await supabase
      .from('payment_transactions')
      .select('status, application_id, created_at')
      .eq('payment_reference', reference)
      .single();

    // If webhook processed successfully, return immediately
    if (!dbError && transaction && transaction.status === 'success') {
      console.log("Webhook-processed payment found:", transaction.status);
      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        source: 'webhook',
        data: {
          status: transaction.status,
          applicationId: transaction.application_id,
        }
      });
    }

    // If webhook shows failed, return immediately
    if (!dbError && transaction && transaction.status === 'failed') {
      console.log("Webhook-processed payment failed:", transaction.status);
      return res.status(200).json({
        success: false,
        message: 'Payment failed',
        source: 'webhook',
        data: {
          status: transaction.status,
          applicationId: transaction.application_id,
        }
      });
    }

    // Step 2: Webhook hasn't processed or transaction not found
    // Fall back to direct Paystack verification
    console.log("Webhook not processed, falling back to Paystack API verification");
    
    let paystackData;
    try {
      paystackData = await verifyPaystackTransaction(reference);
    } catch (error) {
      console.error("Paystack verification failed:", error);
      
      // If we have a pending transaction in DB, return pending status
      if (!dbError && transaction && transaction.status === 'pending') {
        return res.status(200).json({
          success: false,
          status: 'pending',
          message: 'Payment is being processed. Please wait...',
          source: 'database'
        });
      }
      
      // Otherwise, assume invalid reference
      return res.status(200).json({
        success: false,
        status: 'not_found',
        message: 'Payment reference not found',
        source: 'paystack_fallback'
      });
    }

    // Step 3: Process Paystack response
    if (!paystackData.status || !paystackData.data) {
      return res.status(200).json({
        success: false,
        status: 'invalid',
        message: 'Invalid payment reference',
        source: 'paystack_fallback'
      });
    }

    const paystackStatus = paystackData.data.status;
    const paystackAmount = paystackData.data.amount;

    // Step 4: Handle different Paystack statuses
    switch (paystackStatus) {
      case 'success':
        console.log("Paystack shows success, but webhook missed - processing manually");
        try {
          const processResult = await processPaymentManually(paystackData);
          return res.status(200).json({
            success: true,
            message: 'Payment verified and processed successfully',
            source: 'paystack_fallback_processed',
            data: {
              status: 'success',
              applicationId: processResult.returned_application_id,
              enrollmentId: processResult.enrollment_id,
              amount: paystackAmount / 100, // Convert from kobo
            }
          });
        } catch (error) {
          console.error("Manual processing failed:", error);
          return res.status(200).json({
            success: false,
            status: 'processing_error',
            message: 'Payment successful but processing failed. Please contact support.',
            source: 'paystack_fallback_error',
            data: {
              paystackStatus: 'success',
              amount: paystackAmount / 100,
            }
          });
        }

      case 'failed':
      case 'cancelled':
      case 'abandoned':
        return res.status(200).json({
          success: false,
          status: paystackStatus,
          message: `Payment ${paystackStatus}`,
          source: 'paystack_fallback',
          data: {
            status: paystackStatus,
            amount: paystackAmount / 100,
          }
        });

      case 'pending':
      case 'ongoing':
        return res.status(200).json({
          success: false,
          status: 'pending',
          message: 'Payment is still being processed',
          source: 'paystack_fallback',
          data: {
            status: paystackStatus,
            amount: paystackAmount / 100,
          }
        });

      default:
        return res.status(200).json({
          success: false,
          status: 'unknown',
          message: `Payment status: ${paystackStatus}`,
          source: 'paystack_fallback',
          data: {
            status: paystackStatus,
            amount: paystackAmount / 100,
          }
        });
    }

  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error",
      message: "Unable to verify payment status"
    });
  }
}

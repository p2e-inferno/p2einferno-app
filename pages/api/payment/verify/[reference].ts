// Path: p2einferno-app/pages/api/payment/verify/[reference].ts
import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import axios from "axios";
import { extractAndValidateApplicationId } from "../../../../lib/payment-helpers";

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
        timeout: 20000, // 20 second timeout
      }
    );

    return response.data;
  } catch (error) {
    console.error("Paystack verification error:", error);
    throw error;
  }
}

// Manual payment processing if webhook failed
async function processPaymentManually(paystackData: any, req: NextApiRequest) {
  // Extract applicationId using robust extraction logic
  const extractionResult = extractAndValidateApplicationId(paystackData.data);
  
  if (!extractionResult.success || !extractionResult.applicationId) {
    console.error("Manual processing: Failed to extract applicationId", {
      method: extractionResult.method,
      availableMetadata: paystackData.data?.metadata ? Object.keys(paystackData.data.metadata) : 'none'
    });
    throw new Error("No applicationId found in referrer URL or Paystack metadata");
  }
  
  const applicationId = extractionResult.applicationId;
  console.log(`Manual processing: Extracted applicationId via ${extractionResult.method}:`, applicationId);

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

  // Update payment transaction with Paystack reference
  try {
    await supabase
      .from('payment_transactions')
      .update({ 
        paystack_reference: paystackData.data.reference,
        status: 'success'
      })
      .eq('application_id', applicationId);
      
    console.log("Manual processing: Updated transaction with Paystack reference:", paystackData.data.reference);
  } catch (updateError) {
    console.error("Manual processing: Failed to update Paystack reference:", updateError);
    // Don't fail the entire process if this update fails
  }

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

    // Step 1: Try to get applicationId from referrer header to query database
    let applicationId: string | null = null;
    const referrer = req.headers.referer || req.headers.referrer;
    
    if (referrer) {
      const referrerMatch = referrer.match(/\/payment\/([a-fA-F0-9-]+)/);
      if (referrerMatch && referrerMatch[1]) {
        applicationId = referrerMatch[1];
        console.log("Found applicationId from referrer header:", applicationId);
      }
    }

    // Step 2: Check webhook-updated status in our database using applicationId if available
    let transaction: any = null;
    let dbError: any = null;
    
    if (applicationId) {
      // Query by applicationId 
      const result = await supabase
        .from('payment_transactions')
        .select('status, application_id, created_at, paystack_reference')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      transaction = result.data;
      dbError = result.error;
      
      console.log("Transaction lookup by applicationId:", {
        found: !dbError && !!transaction,
        status: transaction?.status,
        applicationId: transaction?.application_id,
        paystackReference: transaction?.paystack_reference,
        createdAt: transaction?.created_at,
        dbError: dbError?.message
      });
    } else {
      // Fallback: Query by payment_reference
      console.log("No applicationId found in referrer, falling back to reference lookup");
      const result = await supabase
        .from('payment_transactions')
        .select('status, application_id, created_at, paystack_reference')
        .eq('payment_reference', reference)
        .single();
      
      transaction = result.data;
      dbError = result.error;
      
      console.log("Transaction lookup by reference (fallback):", {
        found: !dbError && !!transaction,
        status: transaction?.status,
        applicationId: transaction?.application_id,
        paystackReference: transaction?.paystack_reference,
        createdAt: transaction?.created_at,
        dbError: dbError?.message,
        reference: reference
      });
    }

    // If webhook processed successfully, return immediately
    if (!dbError && transaction && transaction.status === 'success') {
      console.log("✓ Webhook-processed payment found with success status");
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
      console.log("✗ Webhook-processed payment found with failed status");
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

    // Step 2: Check if we should wait for webhook
    if (!dbError && transaction && transaction.status === 'pending') {
      const now = Date.now();
      const createdTime = new Date(transaction.created_at).getTime();
      const pendingTime = now - createdTime;
      const maxWebhookWaitTime = 30000; // 30 seconds for webhook
      
      console.log("Webhook wait analysis:", {
        now: new Date(now).toISOString(),
        createdAt: new Date(createdTime).toISOString(),
        pendingTimeMs: pendingTime,
        pendingTimeSeconds: Math.floor(pendingTime / 1000),
        maxWaitTimeMs: maxWebhookWaitTime,
        shouldWait: pendingTime < maxWebhookWaitTime
      });
      
      if (pendingTime < maxWebhookWaitTime) {
        const remainingWaitTime = Math.ceil((maxWebhookWaitTime - pendingTime) / 1000);
        console.log(`⏳ Webhook wait: ${remainingWaitTime}s remaining`);
        
        return res.status(200).json({
          success: false,
          status: 'pending',
          message: 'Payment is being processed. Please wait...',
          source: 'webhook_pending',
          retryAfter: remainingWaitTime
        });
      } else {
        console.log("⏰ Webhook wait timeout exceeded, proceeding to fallback");
      }
    } else if (dbError) {
      console.log("⚠️ Transaction not found in database, proceeding to fallback:", dbError.message);
    } else if (!transaction) {
      console.log("⚠️ No transaction record found, proceeding to fallback");
    } else {
      console.log(`⚠️ Transaction status is '${transaction.status}', proceeding to fallback`);
    }

    // Step 3: Webhook hasn't processed or timeout - fall back to direct Paystack verification
    console.log("Webhook not processed or timeout, falling back to Paystack API verification");
    
    let paystackData;
    try {
      paystackData = await verifyPaystackTransaction(reference);
    } catch (error) {
      console.error("Paystack verification failed:", error);
      
      // If we have a pending transaction in DB, check how long it's been pending
      if (!dbError && transaction && transaction.status === 'pending') {
        const pendingTime = Date.now() - new Date(transaction.created_at).getTime();
        const maxPendingTime = 15000; // 15 seconds max for pending
        
        if (pendingTime < maxPendingTime) {
          return res.status(200).json({
            success: false,
            status: 'pending',
            message: 'Payment is being processed. Please wait...',
            source: 'database',
            retryAfter: Math.ceil((maxPendingTime - pendingTime) / 1000) // seconds until timeout
          });
        } else {
          // Pending too long, treat as not found and try Paystack fallback
          console.log("Transaction pending too long, falling back to Paystack API");
        }
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

    // Debug: Log what Paystack returned to understand the metadata issue
    console.log("Paystack response data:", JSON.stringify({
      status: paystackData.data.status,
      amount: paystackData.data.amount,
      metadata: paystackData.data.metadata,
      customer: paystackData.data.customer
    }, null, 2));

    const paystackStatus = paystackData.data.status;
    const paystackAmount = paystackData.data.amount;

    // Step 4: Handle different Paystack statuses
    switch (paystackStatus) {
      case 'success':
        console.log("Paystack shows success, but webhook missed - processing manually");
        try {
          const processResult = await processPaymentManually(paystackData, req);
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

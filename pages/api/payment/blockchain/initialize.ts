import { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "../../../../lib/supabase";
import { 
  generatePaymentReference, 
  validatePaymentAmount,
  type Currency
} from "../../../../lib/payment-utils";

interface BlockchainPaymentRequest {
  applicationId: string;
  amount: number;
  currency: Currency;
  email: string;
  walletAddress?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { applicationId, amount, currency, email, walletAddress }: BlockchainPaymentRequest = req.body;

    // Validate required fields
    if (!applicationId || !amount || !currency || !email) {
      return res.status(400).json({
        error: "Missing required fields: applicationId, amount, currency, email"
      });
    }

    // Blockchain only handles USD payments
    if (currency !== "USD") {
      return res.status(400).json({
        error: "Blockchain payment only supports USD. Use Paystack for NGN."
      });
    }

    // Validate amount
    if (!validatePaymentAmount(amount, currency)) {
      return res.status(400).json({
        error: `Invalid amount. Minimum is $1 for blockchain payments`
      });
    }

    // Check if application exists
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, user_email, payment_status")
      .eq("id", applicationId)
      .single();

    if (appError || !application) {
      return res.status(404).json({
        error: "Application not found"
      });
    }

    // Check if payment is already completed
    if (application.payment_status === "completed") {
      return res.status(400).json({
        error: "Payment already completed for this application"
      });
    }

    // Generate payment reference
    const reference = generatePaymentReference();

    // For now, return a placeholder for blockchain payment
    // This would typically integrate with a Web3 payment processor
    // or generate a wallet address for direct crypto payment
    
    // Save payment transaction to database
    const { error: transactionError } = await supabase
      .from("payment_transactions")
      .insert({
        application_id: applicationId,
        paystack_reference: reference, // Using same field for reference
        amount,
        currency,
        amount_in_kobo: Math.round(amount * 100), // For consistency, store cents
        status: "pending",
        payment_method: "blockchain",
        metadata: {
          applicationId,
          walletAddress,
          paymentType: "blockchain",
        },
      });

    if (transactionError) {
      console.error("Failed to save blockchain payment transaction:", transactionError);
      return res.status(500).json({
        error: "Failed to save payment transaction"
      });
    }

    // Update application status
    await supabase
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
        // In a real implementation, you would return:
        // - Wallet address to send crypto to
        // - QR code for payment
        // - Smart contract address if applicable
        // - Payment deadline
        message: "Blockchain payment initialized. Please send payment to the provided address.",
        // Placeholder data:
        walletAddress: "0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8", // Example
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=0x742d35Cc6419C40f12Cc33f22b04b4E8b6a5d5e8:${amount}`,
      },
    });

  } catch (error) {
    console.error("Blockchain payment initialization error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}
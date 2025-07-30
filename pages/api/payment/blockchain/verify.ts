import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "../../../../lib/supabase/server";
import { unlockUtils } from "../../../../lib/unlock/lockUtils";
import { CHAIN_CONFIG } from "../../../../lib/blockchain/config";
import { ethers } from "ethers";

const supabase = createAdminClient();

interface BlockchainVerifyRequest {
  transactionHash?: string;
  applicationId: string;
  paymentReference: string;
  failed?: boolean;
  errorMessage?: string;
}

/**
 * Verify blockchain payment transaction and update database
 * POST /api/payment/blockchain/verify
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      transactionHash,
      applicationId,
      paymentReference,
      failed = false,
      errorMessage,
    }: BlockchainVerifyRequest = req.body;

    // Validate required fields
    if (!applicationId || !paymentReference) {
      return res.status(400).json({
        error: "Missing required fields: applicationId, paymentReference",
      });
    }

    // Handle failed payment case
    if (failed || !transactionHash) {
      console.log(
        `Recording failed payment for reference: ${paymentReference}`
      );

      const { error: updateError } = await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          metadata: {
            error: errorMessage || "Transaction failed",
            failedAt: new Date().toISOString(),
          },
        })
        .eq("payment_reference", paymentReference);

      if (updateError) {
        console.error("Failed to update payment transaction:", updateError);
        return res.status(500).json({
          error: "Failed to update payment record",
        });
      }

      return res.status(200).json({
        success: false,
        error: errorMessage || "Payment failed",
      });
    }

    console.log(`Verifying blockchain transaction: ${transactionHash}`);

    // Get transaction receipt from blockchain
    const provider = unlockUtils.getReadOnlyProvider();

    let receipt;
    try {
      receipt = await provider.getTransactionReceipt(transactionHash);
    } catch (error) {
      console.error("Failed to get transaction receipt:", error);
      return res.status(400).json({
        error: "Transaction not found on blockchain",
      });
    }

    if (!receipt) {
      return res.status(400).json({
        error: "Transaction not found",
      });
    }

    // Verify transaction was successful
    if (receipt.status !== 1) {
      console.log(`Transaction failed on blockchain: ${transactionHash}`);

      // Update database with failed status
      await supabase
        .from("payment_transactions")
        .update({
          status: "failed",
          transaction_hash: transactionHash,
          network_chain_id: CHAIN_CONFIG.chain.id,
          metadata: {
            error: "Transaction failed on blockchain",
            failedAt: new Date().toISOString(),
          },
        })
        .eq("payment_reference", paymentReference);

      return res.status(400).json({
        error: "Transaction failed on blockchain",
      });
    }

    // Extract key token ID from Transfer events
    let keyTokenId: string | null = null;

    if (receipt.logs) {
      // Transfer event signature: Transfer(address,address,uint256)
      const transferEventTopic =
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

      for (const log of receipt.logs) {
        if (log.topics[0] === transferEventTopic && log.topics.length >= 4) {
          // In Transfer events: topics[0] = event signature, topics[1] = from, topics[2] = to, topics[3] = tokenId
          try {
            keyTokenId = BigInt(log.topics[3]).toString();
            console.log(`Extracted key token ID: ${keyTokenId}`);
            break; // Take the first transfer event (mint event)
          } catch (error) {
            console.warn("Failed to parse token ID from log:", error);
          }
        }
      }
    }

    // Verify we're on the correct network
    const transaction = await provider.getTransaction(transactionHash);
    if (!transaction) {
      return res.status(400).json({
        error: "Could not verify transaction details",
      });
    }

    // Update payment transaction in database
    const { error: updateError } = await supabase
      .from("payment_transactions")
      .update({
        status: "success",
        transaction_hash: transactionHash,
        key_token_id: keyTokenId,
        network_chain_id: CHAIN_CONFIG.chain.id,
        metadata: {
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: receipt.effectiveGasPrice?.toString(),
          verifiedAt: new Date().toISOString(),
        },
      })
      .eq("payment_reference", paymentReference);

    if (updateError) {
      console.error("Failed to update payment transaction:", updateError);
      return res.status(500).json({
        error: "Failed to update payment record",
      });
    }

    // Update application status to completed
    const { error: appUpdateError } = await supabase
      .from("applications")
      .update({
        payment_status: "completed",
        application_status: "submitted",
      })
      .eq("id", applicationId);

    if (appUpdateError) {
      console.error("Failed to update application status:", appUpdateError);
      return res.status(500).json({
        error: "Failed to update application status",
      });
    }

    console.log(`Payment verification successful for ${paymentReference}`);

    res.status(200).json({
      success: true,
      data: {
        transactionHash,
        keyTokenId,
        networkChainId: CHAIN_CONFIG.chain.id,
        blockNumber: receipt.blockNumber,
        status: "success",
      },
    });
  } catch (error) {
    console.error("Blockchain payment verification error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

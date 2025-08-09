import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "../../../../lib/auth/admin-auth";

/**
 * Fetch payment transactions requiring admin attention
 * GET /api/admin/payments
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();

    // Fetch transactions with status processing, failed, or pending
    // that may need admin intervention
    const { data: transactions, error } = await supabase
      .from("payment_transactions")
      .select(
        `
        id,
        application_id,
        payment_reference,
        status,
        transaction_hash,
        network_chain_id,
        created_at,
        updated_at,
        metadata,
        applications!payment_transactions_application_id_fkey (
          user_email,
          user_profile_id,
          cohorts (
            name,
            lock_address
          )
        )
      `
      )
      .in("status", ["processing", "failed", "pending"])
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Error fetching payment transactions:", error);
      return res.status(500).json({
        error: "Failed to fetch payment transactions",
      });
    }

    // Filter out transactions where applications data is missing
    const validTransactions =
      transactions?.filter(
        (tx: any) => tx.applications && tx.applications.user_email
      ) || [];

    // For each transaction, fetch user profile data if user_profile_id exists
    const enrichedTransactions = await Promise.all(
      validTransactions.map(async (tx: any) => {
        if (tx.applications.user_profile_id) {
          const { data: userProfile } = await supabase
            .from("user_profiles")
            .select("wallet_address")
            .eq("id", tx.applications.user_profile_id)
            .single();
          
          return {
            ...tx,
            applications: {
              ...tx.applications,
              user_profiles: userProfile ? { wallet_address: userProfile.wallet_address } : null
            }
          };
        }
        return {
          ...tx,
          applications: {
            ...tx.applications,
            user_profiles: null
          }
        };
      })
    );

    res.status(200).json({
      success: true,
      transactions: enrichedTransactions,
      count: enrichedTransactions.length,
    });
  } catch (error) {
    console.error("Admin payments API error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
}

// Wrap the handler with admin authentication middleware
export default withAdminAuth(handler);

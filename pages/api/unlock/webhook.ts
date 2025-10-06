import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:unlock:webhook");

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const event = req.body;
  // Basic validation
  if (!event || !event.type) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const supabase = createAdminClient();
    switch (event.type) {
      case "key.purchase": {
        const { owner, lock, tokenId } = event.data;
        // Attempt to find cohort by lock
        const { data: cohort } = await supabase
          .from("cohorts")
          .select("id")
          .eq("lock_address", lock)
          .maybeSingle();

        if (cohort) {
          await supabase.from("user_cohorts").upsert({
            user_id: owner.toLowerCase(),
            cohort_id: cohort.id,
            key_id: tokenId,
            status: "active",
            joined_at: new Date().toISOString(),
          });
        }

        // Check milestone lock mapping
        const { data: milestone } = await supabase
          .from("cohort_milestones")
          .select("id")
          .eq("lock_address", lock)
          .maybeSingle();

        if (milestone) {
          await supabase.from("user_milestones").upsert({
            user_id: owner.toLowerCase(),
            milestone_id: milestone.id,
            key_id: tokenId,
            claimed_at: new Date().toISOString(),
          });
        }
        break;
      }
      // Add more event types as needed
      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    log.error("unlock webhook error", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

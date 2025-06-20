import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check if user is authenticated
  try {
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get the cohort ID from the request
    const cohortId = req.body.cohort_id;
    if (!cohortId) {
      return res.status(400).json({ error: "Missing cohort ID" });
    }

    // Get supabase admin client
    const supabase = createAdminClient();

    // 1. First check if the user has a profile
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("id, wallet_address")
      .eq("privy_user_id", user.id)
      .single();

    if (!userProfile) {
      return res
        .status(403)
        .json({ error: "Forbidden: User profile not found" });
    }

    // 2. Check if the user has admin privileges through the metadata
    const { data: adminCheck } = await supabase.rpc("is_admin", {
      user_id: userProfile.id,
    });

    if (!adminCheck) {
      // 3. If not admin, check if the user is a cohort manager
      const { data: isCohortManager } = await supabase
        .from("cohort_managers")
        .select("id")
        .match({
          user_profile_id: userProfile.id,
          cohort_id: cohortId,
        })
        .single();

      if (!isCohortManager) {
        return res
          .status(403)
          .json({ error: "Forbidden: Not authorized to manage this cohort" });
      }
    }

    // Handle different HTTP methods
    switch (req.method) {
      case "POST":
        return await createMilestone(req, res, supabase);
      case "PUT":
        return await updateMilestone(req, res, supabase);
      case "DELETE":
        return await deleteMilestone(req, res, supabase);
      default:
        return res.status(405).json({ error: "Method not allowed" });
    }
  } catch (error: any) {
    console.error("API error:", error);
    return res
      .status(500)
      .json({ error: error.message || "Internal server error" });
  }
}

async function createMilestone(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const milestone = req.body;

  if (
    !milestone ||
    !milestone.cohort_id ||
    !milestone.name ||
    !milestone.description
  ) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const now = new Date().toISOString();

    // Add created_at and updated_at if not provided
    if (!milestone.created_at) milestone.created_at = now;
    if (!milestone.updated_at) milestone.updated_at = now;

    // Insert the milestone using the admin client which bypasses RLS
    const { data, error } = await supabase
      .from("cohort_milestones")
      .insert(milestone)
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json(data);
  } catch (error: any) {
    console.error("Error creating milestone:", error);
    return res.status(400).json({ error: error.message });
  }
}

async function updateMilestone(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { id, ...milestone } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Missing milestone ID" });
  }

  try {
    const now = new Date().toISOString();
    milestone.updated_at = now;

    // Update the milestone using the admin client which bypasses RLS
    const { data, error } = await supabase
      .from("cohort_milestones")
      .update(milestone)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error: any) {
    console.error("Error updating milestone:", error);
    return res.status(400).json({ error: error.message });
  }
}

async function deleteMilestone(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { id } = req.query;

  if (!id) {
    return res.status(400).json({ error: "Missing milestone ID" });
  }

  try {
    // Delete the milestone using the admin client which bypasses RLS
    const { error } = await supabase
      .from("cohort_milestones")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return res.status(200).json({ 
      success: true, 
      message: "Milestone deleted successfully" 
    });
  } catch (error: any) {
    console.error("Error deleting milestone:", error);
    return res.status(400).json({ error: error.message });
  }
}

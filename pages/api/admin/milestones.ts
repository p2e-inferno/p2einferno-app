import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Get supabase admin client
    const supabase = createAdminClient();

    // Handle different HTTP methods
    switch (req.method) {
      case "GET":
        return await getMilestones(req, res, supabase);
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
    console.error("Milestone API error:", error);
    return res.status(500).json({ error: error.message || "Server error" });
  }
}

async function getMilestones(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { cohort_id, milestone_id } = req.query;

  // If milestone_id is provided, get a single milestone
  if (milestone_id) {
    try {
      const { data, error } = await supabase
        .from("cohort_milestones")
        .select("*")
        .eq("id", milestone_id)
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        data: data
      });
    } catch (error: any) {
      console.error("Error fetching milestone:", error);
      return res.status(400).json({ error: error.message });
    }
  }

  // Otherwise get milestones by cohort_id
  if (!cohort_id) {
    return res.status(400).json({ error: "Missing cohort ID or milestone ID" });
  }

  try {
    const { data, error } = await supabase
      .from("cohort_milestones")
      .select("*")
      .eq("cohort_id", cohort_id)
      .order("order_index");

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: data || []
    });
  } catch (error: any) {
    console.error("Error fetching milestones:", error);
    return res.status(400).json({ error: error.message });
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

export default withAdminAuth(handler);

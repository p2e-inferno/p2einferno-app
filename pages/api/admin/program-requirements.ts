import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:program-requirements");

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    return createRequirements(req, res);
  } else if (req.method === "GET") {
    return getRequirements(req, res);
  } else if (req.method === "PUT") {
    return updateRequirement(req, res);
  } else if (req.method === "DELETE") {
    return deleteRequirement(req, res);
  } else {
    res.setHeader("Allow", ["POST", "GET", "PUT", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
}

async function createRequirements(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { requirements, cohortId } = req.body;

    if (
      !requirements ||
      !Array.isArray(requirements) ||
      requirements.length === 0
    ) {
      return res.status(400).json({ error: "Requirements array is required" });
    }

    if (!cohortId) {
      return res.status(400).json({ error: "Cohort ID is required" });
    }

    // Validate requirements
    for (const requirement of requirements) {
      if (!requirement.content || !requirement.content.trim()) {
        return res.status(400).json({
          error: "Each requirement must have content",
        });
      }
    }

    // Delete existing requirements for this cohort
    await supabaseAdmin
      .from("program_requirements")
      .delete()
      .eq("cohort_id", cohortId);

    // Insert new requirements
    const { data, error } = await supabaseAdmin
      .from("program_requirements")
      .insert(requirements)
      .select();

    if (error) {
      log.error("Error creating requirements:", error);
      return res.status(500).json({ error: "Failed to create requirements" });
    }

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    log.error("Error in createRequirements:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getRequirements(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { cohortId } = req.query;

    if (!cohortId) {
      return res.status(400).json({ error: "Cohort ID is required" });
    }

    const { data, error } = await supabase
      .from("program_requirements")
      .select("*")
      .eq("cohort_id", cohortId)
      .order("order_index");

    if (error) {
      log.error("Error fetching requirements:", error);
      return res.status(500).json({ error: "Failed to fetch requirements" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    log.error("Error in getRequirements:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateRequirement(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id, ...updateData } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Requirement ID is required" });
    }

    const { data, error } = await supabaseAdmin
      .from("program_requirements")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      log.error("Error updating requirement:", error);
      return res.status(500).json({ error: "Failed to update requirement" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    log.error("Error in updateRequirement:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteRequirement(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Requirement ID is required" });
    }

    const { error } = await supabaseAdmin
      .from("program_requirements")
      .delete()
      .eq("id", id);

    if (error) {
      log.error("Error deleting requirement:", error);
      return res.status(500).json({ error: "Failed to delete requirement" });
    }

    return res.status(200).json({
      success: true,
      message: "Requirement deleted successfully",
    });
  } catch (error) {
    log.error("Error in deleteRequirement:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAdminAuth(handler);

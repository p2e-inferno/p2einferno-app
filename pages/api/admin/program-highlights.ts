import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { withAdminAuth } from "@/lib/auth/admin-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:program-highlights");

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY!,
);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    return createHighlights(req, res);
  } else if (req.method === "GET") {
    return getHighlights(req, res);
  } else if (req.method === "PUT") {
    return updateHighlight(req, res);
  } else if (req.method === "DELETE") {
    return deleteHighlight(req, res);
  } else {
    res.setHeader("Allow", ["POST", "GET", "PUT", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
}

async function createHighlights(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { highlights, cohortId } = req.body;

    if (!highlights || !Array.isArray(highlights) || highlights.length === 0) {
      return res.status(400).json({ error: "Highlights array is required" });
    }

    if (!cohortId) {
      return res.status(400).json({ error: "Cohort ID is required" });
    }

    // Validate highlights
    for (const highlight of highlights) {
      if (!highlight.content || !highlight.content.trim()) {
        return res.status(400).json({
          error: "Each highlight must have content",
        });
      }
    }

    // Delete existing highlights for this cohort
    await supabaseAdmin
      .from("program_highlights")
      .delete()
      .eq("cohort_id", cohortId);

    // Insert new highlights
    const { data, error } = await supabaseAdmin
      .from("program_highlights")
      .insert(highlights)
      .select();

    if (error) {
      log.error("Error creating highlights:", error);
      return res.status(500).json({ error: "Failed to create highlights" });
    }

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    log.error("Error in createHighlights:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getHighlights(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { cohortId } = req.query;

    if (!cohortId) {
      return res.status(400).json({ error: "Cohort ID is required" });
    }

    const { data, error } = await supabase
      .from("program_highlights")
      .select("*")
      .eq("cohort_id", cohortId)
      .order("order_index");

    if (error) {
      log.error("Error fetching highlights:", error);
      return res.status(500).json({ error: "Failed to fetch highlights" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    log.error("Error in getHighlights:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateHighlight(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id, ...updateData } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Highlight ID is required" });
    }

    const { data, error } = await supabaseAdmin
      .from("program_highlights")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      log.error("Error updating highlight:", error);
      return res.status(500).json({ error: "Failed to update highlight" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    log.error("Error in updateHighlight:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteHighlight(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Highlight ID is required" });
    }

    const { error } = await supabaseAdmin
      .from("program_highlights")
      .delete()
      .eq("id", id);

    if (error) {
      log.error("Error deleting highlight:", error);
      return res.status(500).json({ error: "Failed to delete highlight" });
    }

    return res.status(200).json({
      success: true,
      message: "Highlight deleted successfully",
    });
  } catch (error) {
    log.error("Error in deleteHighlight:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAdminAuth(handler);

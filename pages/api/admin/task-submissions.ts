import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { withAdminAuth } from "@/lib/auth/admin-auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    return getSubmissions(req, res);
  } else if (req.method === "PUT") {
    return updateSubmission(req, res);
  } else if (req.method === "POST") {
    return createSubmission(req, res);
  } else {
    res.setHeader("Allow", ["GET", "PUT", "POST"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
}

async function getSubmissions(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { taskId, userId } = req.query;

    let query = supabaseAdmin.from("task_submissions").select("*");

    if (taskId) {
      query = query.eq("task_id", taskId);
    }

    if (userId) {
      query = query.eq("user_id", userId);
    }

    query = query.order("submitted_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching submissions:", error);
      return res.status(500).json({ error: "Failed to fetch submissions" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in getSubmissions:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateSubmission(req: NextApiRequest, res: NextApiResponse) {
  try {

    const { id, status, feedback, reviewed_by, reviewed_at } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Submission ID is required" });
    }

    if (!status || !["pending", "completed", "failed", "retry"].includes(status)) {
      return res.status(400).json({ 
        error: "Valid status is required (pending, completed, failed, retry)" 
      });
    }

    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (feedback !== undefined) {
      updateData.feedback = feedback;
    }

    if (reviewed_by) {
      updateData.reviewed_by = reviewed_by;
    }

    if (reviewed_at) {
      updateData.reviewed_at = reviewed_at;
    }

    const { data, error } = await supabaseAdmin
      .from("task_submissions")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating submission:", error);
      return res.status(500).json({ error: "Failed to update submission" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in updateSubmission:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function createSubmission(req: NextApiRequest, res: NextApiResponse) {
  try {

    const { task_id, submission_url } = req.body;

    if (!task_id || !submission_url) {
      return res.status(400).json({ 
        error: "Task ID and submission URL are required" 
      });
    }

    // Validate URL format
    try {
      new URL(submission_url);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    // Check if user already has a submission for this task
    const { data: existingSubmission } = await supabase
      .from("task_submissions")
      .select("id, status")
      .eq("task_id", task_id)
      .eq("user_id", 'admin')
      .single();

    if (existingSubmission && existingSubmission.status !== "failed") {
      return res.status(400).json({ 
        error: "You already have a submission for this task" 
      });
    }

    const submissionData = {
      task_id,
      user_id: 'admin',
      submission_url,
      status: "pending" as const,
      submitted_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from("task_submissions")
      .insert(submissionData)
      .select()
      .single();

    if (error) {
      console.error("Error creating submission:", error);
      return res.status(500).json({ error: "Failed to create submission" });
    }

    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in createSubmission:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withAdminAuth(handler);
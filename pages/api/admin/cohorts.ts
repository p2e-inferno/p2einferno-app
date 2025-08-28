import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const supabase = createAdminClient();

    switch (req.method) {
      case "GET":
        return await getCohorts(req, res, supabase);
      case "POST":
        return await createCohort(req, res, supabase);
      case "PUT":
        return await updateCohort(req, res, supabase);
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

async function getCohorts(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  try {
    const { data, error } = await supabase
      .from("cohorts")
      .select(`
        *,
        bootcamp_program:bootcamp_program_id (
          id,
          name
        )
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error("Error fetching cohorts:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch cohorts",
    });
  }
}

async function createCohort(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const cohort = req.body;
  if (!cohort || !cohort.id || !cohort.name || !cohort.bootcamp_program_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const now = new Date().toISOString();
    if (!cohort.created_at) cohort.created_at = now;
    if (!cohort.updated_at) cohort.updated_at = now;
    const { data, error } = await supabase
      .from("cohorts")
      .insert(cohort)
      .select()
      .single();
    if (error) throw error;
    return res.status(201).json(data);
  } catch (error: any) {
    console.error("Error creating cohort:", error);
    return res.status(400).json({ error: error.message });
  }
}

async function updateCohort(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { id, bootcamp_program, ...cohort } = req.body;
  if (!id) return res.status(400).json({ error: "Missing cohort ID" });
  try {
    cohort.updated_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("cohorts")
      .update(cohort)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return res.status(200).json(data);
  } catch (error: any) {
    console.error("Error updating cohort:", error);
    return res.status(400).json({ error: error.message });
  }
}

export default withAdminAuth(handler);

import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase admin client (service role)
    const supabase = createAdminClient();

    // Handle the request method
    switch (req.method) {
      case "POST":
        return await createBootcamp(req, res, supabase);
      case "PUT":
        return await updateBootcamp(req, res, supabase);
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

// Wrap the handler with admin authentication middleware
export default withAdminAuth(handler);

async function createBootcamp(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const bootcamp = req.body;

  // Basic validation
  if (!bootcamp || !bootcamp.id || !bootcamp.name || !bootcamp.description) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Ensure timestamps
    const now = new Date().toISOString();
    if (!bootcamp.created_at) bootcamp.created_at = now;
    if (!bootcamp.updated_at) bootcamp.updated_at = now;

    // Insert bootcamp (will bypass RLS due to service role)
    const { data, error } = await supabase
      .from("bootcamp_programs")
      .insert([bootcamp])
      .select();

    if (error) throw error;

    return res.status(201).json(data[0]);
  } catch (error: any) {
    console.error("Error creating bootcamp:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to create bootcamp" });
  }
}

async function updateBootcamp(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { id, ...bootcamp } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Bootcamp ID is required" });
  }

  try {
    // Update timestamp
    bootcamp.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("bootcamp_programs")
      .update(bootcamp)
      .eq("id", id)
      .select();

    if (error) throw error;

    return res.status(200).json(data[0]);
  } catch (error: any) {
    console.error("Error updating bootcamp:", error);
    return res
      .status(500)
      .json({ error: error.message || "Failed to update bootcamp" });
  }
}

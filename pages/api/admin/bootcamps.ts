import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Initialize Supabase admin client (service role)
    const supabase = createAdminClient();

    // Handle the request method
    switch (req.method) {
      case "GET":
        return await getBootcamps(req, res, supabase);
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

async function getBootcamps(
  _req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  try {
    const { data, error } = await supabase
      .from("bootcamp_programs")
      .select("*")
      .order("name");

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data: data || [],
    });
  } catch (error: any) {
    console.error("Error fetching bootcamps:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch bootcamps",
    });
  }
}

async function createBootcamp(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const bootcamp = req.body;

  // Debug: Log received data
  console.log("[BOOTCAMP_CREATE] Received bootcamp data:", {
    hasId: !!bootcamp?.id,
    hasName: !!bootcamp?.name,
    hasDescription: !!bootcamp?.description,
    hasDurationWeeks: !!bootcamp?.duration_weeks,
    hasMaxReward: bootcamp?.max_reward_dgt !== undefined,
    hasLockAddress: !!bootcamp?.lock_address,
    receivedFields: bootcamp ? Object.keys(bootcamp) : [],
    bootcampData: bootcamp
  });

  // Enhanced validation with detailed error reporting
  const missingFields = [];
  if (!bootcamp) {
    return res.status(400).json({ error: "No bootcamp data provided" });
  }
  if (!bootcamp.id) missingFields.push("id");
  if (!bootcamp.name) missingFields.push("name");
  if (!bootcamp.description) missingFields.push("description");
  if (bootcamp.duration_weeks === undefined || bootcamp.duration_weeks === null) missingFields.push("duration_weeks");
  if (bootcamp.max_reward_dgt === undefined || bootcamp.max_reward_dgt === null) missingFields.push("max_reward_dgt");

  if (missingFields.length > 0) {
    console.error("[BOOTCAMP_CREATE] Missing required fields:", missingFields);
    return res.status(400).json({ 
      error: `Missing required fields: ${missingFields.join(", ")}`,
      missingFields,
      receivedData: bootcamp
    });
  }

  // Validate field types and values
  if (typeof bootcamp.duration_weeks !== 'number' || bootcamp.duration_weeks < 1) {
    console.error("[BOOTCAMP_CREATE] Invalid duration_weeks:", bootcamp.duration_weeks);
    return res.status(400).json({ error: "duration_weeks must be a positive number" });
  }

  if (typeof bootcamp.max_reward_dgt !== 'number' || bootcamp.max_reward_dgt < 0) {
    console.error("[BOOTCAMP_CREATE] Invalid max_reward_dgt:", bootcamp.max_reward_dgt);
    return res.status(400).json({ error: "max_reward_dgt must be a non-negative number" });
  }

  try {
    // Ensure timestamps
    const now = new Date().toISOString();
    if (!bootcamp.created_at) bootcamp.created_at = now;
    if (!bootcamp.updated_at) bootcamp.updated_at = now;

    console.log("[BOOTCAMP_CREATE] Final bootcamp data before insert:", bootcamp);

    // Insert bootcamp (will bypass RLS due to service role)
    const { data, error } = await supabase
      .from("bootcamp_programs")
      .insert([bootcamp])
      .select();

    if (error) {
      console.error("[BOOTCAMP_CREATE] Database error:", {
        error: error,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      });
      throw error;
    }

    console.log("[BOOTCAMP_CREATE] Successfully created bootcamp:", {
      id: data[0]?.id,
      name: data[0]?.name,
      lock_address: data[0]?.lock_address
    });

    return res.status(201).json(data[0]);
  } catch (error: any) {
    console.error("[BOOTCAMP_CREATE] Error creating bootcamp:", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      stack: error.stack
    });
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

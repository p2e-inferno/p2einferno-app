import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // Ensure user is authenticated via Privy
    const user = await getPrivyUser(req);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Initialize Supabase admin client (service role)
    const supabase = createAdminClient();

    // Look up the user profile to verify admin privileges
    let { data: userProfile } = await supabase
      .from("user_profiles")
      .select("id, wallet_address, privy_user_id, email, display_name")
      .eq("privy_user_id", user.id)
      .single();

    // If user profile doesn't exist, create it
    if (!userProfile) {
      const profileData = {
        privy_user_id: user.id,
        display_name: `Admin${user.id.slice(-6)}`, // Generate a display name
        experience_points: 0,
        level: 1,
        onboarding_completed: true,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: newProfile, error: createError } = await supabase
        .from("user_profiles")
        .insert([profileData])
        .select("id, wallet_address, privy_user_id, email, display_name")
        .single();

      if (createError) {
        console.error("Error creating user profile:", createError);
        return res
          .status(500)
          .json({ error: "Failed to create user profile" });
      }

      userProfile = newProfile;
    }

    // Determine admin status
    let isAdmin = false;

    // 1. Check DB role via is_admin() RPC
    const { data: adminDbCheck, error: adminError } = await supabase.rpc(
      "is_admin",
      {
        user_id: userProfile.id,
      }
    );

    if (adminError) throw adminError;

    if (adminDbCheck) isAdmin = true;

    // 2. Fallback to dev-mode wallet allow-list (comma-separated addresses)
    if (!isAdmin && process.env.DEV_ADMIN_ADDRESSES) {
      const devAdmins = process.env.DEV_ADMIN_ADDRESSES.split(",")
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);

      if (
        userProfile.wallet_address &&
        devAdmins.includes(userProfile.wallet_address.toLowerCase())
      ) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return res.status(403).json({ error: "Forbidden: Admins only" });
    }

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
      .insert(bootcamp)
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json(data);
  } catch (error: any) {
    console.error("Error creating bootcamp:", error);
    return res.status(400).json({ error: error.message });
  }
}

async function updateBootcamp(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  const { id, ...bootcamp } = req.body;

  if (!id) {
    return res.status(400).json({ error: "Missing bootcamp ID" });
  }

  try {
    const now = new Date().toISOString();
    bootcamp.updated_at = now;

    const { data, error } = await supabase
      .from("bootcamp_programs")
      .update(bootcamp)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json(data);
  } catch (error: any) {
    console.error("Error updating bootcamp:", error);
    return res.status(400).json({ error: error.message });
  }
}

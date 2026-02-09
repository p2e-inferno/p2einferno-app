import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { getPrivyUser } from "@/lib/auth/privy";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:user:task:[taskId]:upload");

type UploadResponse = {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
};

// Allow larger request body for base64-encoded file uploads (2MB file = ~2.7MB base64)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "3mb",
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UploadResponse>,
) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const supabase = createAdminClient();
    const user = await getPrivyUser(req);

    if (!user?.id) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication required" });
    }

    const { file, fileName, contentType } = req.body || {};

    if (!file || !fileName || !contentType) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: file, fileName, contentType",
      });
    }

    const fileBuffer = Buffer.from(file, "base64");
    if (fileBuffer.length > 2 * 1024 * 1024) {
      return res
        .status(400)
        .json({ success: false, error: "File size must be less than 2MB" });
    }

    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.split(".").pop();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const objectPath = `${user.id}/${unique}.${ext}`;

    const { data, error } = await supabase.storage
      .from("task-submissions")
      .upload(objectPath, fileBuffer, {
        contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    const { data: urlData } = supabase.storage
      .from("task-submissions")
      .getPublicUrl(data.path);

    return res
      .status(200)
      .json({ success: true, url: urlData.publicUrl, path: data.path });
  } catch (err: any) {
    log.error("Task file upload error:", err);
    return res
      .status(500)
      .json({ success: false, error: err?.message || "Failed to upload file" });
  }
}

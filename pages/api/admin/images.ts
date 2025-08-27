import { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";
import { withAdminAuth } from "@/lib/auth/admin-auth";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createAdminClient();

  switch (req.method) {
    case "POST":
      return await uploadImage(req, res, supabase);
    case "DELETE":
      return await deleteImage(req, res, supabase);
    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
}

async function uploadImage(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  try {
    const { file, fileName, contentType, bucketName = "bootcamp-images" } = req.body;

    if (!file || !fileName || !contentType) {
      return res.status(400).json({ error: "Missing required fields: file, fileName, contentType" });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(contentType)) {
      return res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed." });
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(file, 'base64');
    
    // Check file size (5MB limit)
    if (fileBuffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ error: "File size must be less than 5MB" });
    }

    // Generate unique filename
    const fileExt = fileName.split('.').pop();
    const uniqueFileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(uniqueFileName, fileBuffer, {
        contentType: contentType,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      throw error;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path);

    return res.status(200).json({
      success: true,
      url: urlData.publicUrl,
    });
  } catch (error: any) {
    console.error("Image upload error:", error);
    return res.status(500).json({ 
      error: error.message || "Failed to upload image" 
    });
  }
}

async function deleteImage(
  req: NextApiRequest,
  res: NextApiResponse,
  supabase: any
) {
  try {
    const { url, bucketName = "bootcamp-images" } = req.body;

    if (!url) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    try {
      // Extract filename from URL
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/");
      const fileName = pathParts[pathParts.length - 1];

      if (fileName) {
        const { error } = await supabase.storage
          .from(bucketName)
          .remove([fileName]);

        if (error) {
          console.warn("Storage deletion failed:", error);
          // Don't throw here - we still want to return success
          // as the main goal is to remove it from the form
        }
      }
    } catch (parseError) {
      console.warn("Could not parse URL for deletion:", parseError);
      // Continue anyway - the main goal is form cleanup
    }

    return res.status(200).json({
      success: true,
      message: "Image removed successfully",
    });
  } catch (error: any) {
    console.error("Image deletion error:", error);
    return res.status(500).json({ 
      error: error.message || "Failed to delete image" 
    });
  }
}

export default withAdminAuth(handler);
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      message: "API is running successfully",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Health check failed",
    });
  }
}

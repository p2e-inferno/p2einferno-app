import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/lib/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { verifyPrivyToken } from "@/lib/auth/privy-server";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    return createTasks(req, res);
  } else if (req.method === "GET") {
    return getTasks(req, res);
  } else if (req.method === "PUT") {
    return updateTask(req, res);
  } else if (req.method === "DELETE") {
    return deleteTask(req, res);
  } else {
    res.setHeader("Allow", ["POST", "GET", "PUT", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  }
}

async function createTasks(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.substring(7);
    const user = await verifyPrivyToken(token);
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { tasks, milestoneId } = req.body;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: "Tasks array is required" });
    }

    if (!milestoneId) {
      return res.status(400).json({ error: "Milestone ID is required" });
    }

    // Validate tasks
    for (const task of tasks) {
      if (!task.title || task.title.trim() === "") {
        return res.status(400).json({
          error: "Each task must have a title",
        });
      }
      if (task.reward_amount === undefined || task.reward_amount === null || task.reward_amount < 0) {
        return res.status(400).json({
          error: "Each task must have a valid reward amount (0 or greater)",
        });
      }
    }

    // Delete existing tasks for this milestone (if updating)
    await supabaseAdmin.from("milestone_tasks").delete().eq("milestone_id", milestoneId);

    // Insert new tasks
    const { data, error } = await supabaseAdmin.from("milestone_tasks").insert(tasks).select();

    if (error) {
      console.error("Error creating tasks:", error);
      return res.status(500).json({ error: "Failed to create tasks" });
    }
    return res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in createTasks:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getTasks(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { milestoneId, taskId } = req.query;

    // If taskId is provided, fetch a specific task
    if (taskId) {
      const { data, error } = await supabaseAdmin
        .from("milestone_tasks")
        .select("*")
        .eq("id", taskId);

      if (error) {
        console.error("Error fetching task:", error);
        return res.status(500).json({ error: "Failed to fetch task" });
      }

      return res.status(200).json({
        success: true,
        data,
      });
    }

    // Otherwise, fetch tasks by milestone ID
    if (!milestoneId) {
      return res.status(400).json({ error: "Milestone ID or Task ID is required" });
    }

    // Use admin client to ensure we can read all tasks
    const { data, error } = await supabaseAdmin
      .from("milestone_tasks")
      .select("*")
      .eq("milestone_id", milestoneId)
      .order("order_index");

    if (error) {
      console.error("Error fetching tasks:", error);
      return res.status(500).json({ error: "Failed to fetch tasks" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in getTasks:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function updateTask(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.substring(7);
    const user = await verifyPrivyToken(token);
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { id, ...updateData } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Task ID is required" });
    }

    const { data, error } = await supabaseAdmin
      .from("milestone_tasks")
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("Error updating task:", error);
      return res.status(500).json({ error: "Failed to update task" });
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in updateTask:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteTask(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Verify authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.substring(7);
    const user = await verifyPrivyToken(token);
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: "Task ID is required" });
    }

    const { error } = await supabaseAdmin
      .from("milestone_tasks")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Error deleting task:", error);
      return res.status(500).json({ error: "Failed to delete task" });
    }

    return res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteTask:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
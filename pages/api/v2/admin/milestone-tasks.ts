import type { NextApiRequest, NextApiResponse } from "next";
import { createAdminClient } from "@/lib/supabase/server";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const supabase = createAdminClient();
  try {
    if (req.method === "GET") {
      const { task_id, taskId, milestone_id, milestoneId } = req.query as any;
      if (task_id || taskId) {
        const id = task_id || taskId;
        const { data, error } = await supabase
          .from("milestone_tasks")
          .select("*")
          .eq("id", id);
        if (error)
          return res.status(500).json({ error: "Failed to fetch task" });
        return res.status(200).json({ success: true, data });
      }
      const mid = milestone_id || milestoneId;
      if (!mid)
        return res
          .status(400)
          .json({ error: "Milestone ID or Task ID is required" });
      const { data, error } = await supabase
        .from("milestone_tasks")
        .select("*")
        .eq("milestone_id", mid)
        .order("order_index");
      if (error)
        return res.status(500).json({ error: "Failed to fetch tasks" });
      return res.status(200).json({ success: true, data });
    }

    if (req.method === "POST") {
      const { tasks, milestoneId } = req.body || {};
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return res.status(400).json({ error: "Tasks array is required" });
      }
      if (!milestoneId) {
        return res.status(400).json({ error: "Milestone ID is required" });
      }
      // Clear existing tasks (legacy behavior)
      await supabase
        .from("milestone_tasks")
        .delete()
        .eq("milestone_id", milestoneId);
      const { data, error } = await supabase
        .from("milestone_tasks")
        .insert(tasks)
        .select("*");
      if (error)
        return res.status(500).json({ error: "Failed to create tasks" });
      return res.status(201).json({ success: true, data });
    }

    if (req.method === "PUT") {
      const { id, ...update } = req.body || {};
      if (!id) return res.status(400).json({ error: "Task ID is required" });
      const { data, error } = await supabase
        .from("milestone_tasks")
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error)
        return res.status(500).json({ error: "Failed to update task" });
      return res.status(200).json({ success: true, data });
    }

    if (req.method === "DELETE") {
      const { id } = req.query as any;
      if (!id) return res.status(400).json({ error: "Task ID is required" });
      const { error } = await supabase
        .from("milestone_tasks")
        .delete()
        .eq("id", id);
      if (error)
        return res.status(500).json({ error: "Failed to delete task" });
      return res.status(200).json({ success: true });
    }

    res.setHeader("Allow", ["GET", "POST", "PUT", "DELETE"]);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error: any) {
    return res.status(500).json({ error: "Server error" });
  }
}

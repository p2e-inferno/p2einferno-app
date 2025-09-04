import type { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '@/lib/supabase/server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createAdminClient();
  try {
    if (req.method === 'GET') {
      const { taskId, userId } = req.query as any;
      let query = supabase.from('task_submissions').select('*').order('submitted_at', { ascending: false });
      if (taskId) query = query.eq('task_id', taskId);
      if (userId) query = query.eq('user_id', userId);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'Failed to fetch submissions' });
      return res.status(200).json({ success: true, data });
    }
    if (req.method === 'PUT') {
      const { id, status, feedback, reviewed_by, reviewed_at } = req.body as any;
      if (!id) return res.status(400).json({ error: 'Submission ID is required' });
      if (!status || !['pending', 'completed', 'failed', 'retry'].includes(status)) {
        return res.status(400).json({ error: 'Valid status is required (pending, completed, failed, retry)' });
      }
      const update: any = { status, updated_at: new Date().toISOString() };
      if (feedback !== undefined) update.feedback = feedback;
      if (reviewed_by) update.reviewed_by = reviewed_by;
      if (reviewed_at) update.reviewed_at = reviewed_at;
      const { data, error } = await supabase.from('task_submissions').update(update).eq('id', id).select('*').single();
      if (error) return res.status(500).json({ error: 'Failed to update submission' });
      return res.status(200).json({ success: true, data });
    }
    if (req.method === 'POST') {
      const { task_id, submission_url } = req.body as any;
      if (!task_id || !submission_url) return res.status(400).json({ error: 'Task ID and submission URL are required' });
      try { new URL(submission_url); } catch { return res.status(400).json({ error: 'Invalid URL format' }); }
      const now = new Date().toISOString();
      const { data, error } = await supabase.from('task_submissions').insert({ task_id, user_id: 'admin', submission_url, status: 'pending', submitted_at: now, created_at: now, updated_at: now }).select('*').single();
      if (error) return res.status(500).json({ error: 'Failed to create submission' });
      return res.status(201).json({ success: true, data });
    }
    res.setHeader('Allow', ['GET', 'POST', 'PUT']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Server error' });
  }
}


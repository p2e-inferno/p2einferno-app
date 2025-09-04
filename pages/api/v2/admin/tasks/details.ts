import type { NextApiRequest, NextApiResponse } from 'next';
import { createAdminClient } from '@/lib/supabase/server';
import { parseIncludeParam } from '@/lib/api/parsers/admin-task-details';
import { clampPageSize } from '@/lib/config/admin';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:v2:task-details');

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const taskId = (req.query.task_id as string) || '';
  if (!taskId) return res.status(400).json({ error: 'task_id is required' });
  const include = parseIncludeParam((req.query.include as string) || null, clampPageSize);

  const supabase = createAdminClient();
  try {
    const { data: taskRows, error: taskErr } = await supabase.from('milestone_tasks').select('*').eq('id', taskId);
    if (taskErr) return res.status(500).json({ error: 'Failed to fetch task' });
    if (!taskRows || taskRows.length === 0) return res.status(404).json({ error: 'Task not found' });
    const task = taskRows[0];
    const result: any = { task };

    let milestone: any = null;
    if (include.milestone) {
      const { data, error } = await supabase.from('cohort_milestones').select('*').eq('id', task.milestone_id).single();
      if (error) return res.status(500).json({ error: 'Failed to fetch milestone' });
      milestone = data;
      result.milestone = data;
    }

    if (include.cohort) {
      const cohortId = milestone?.cohort_id || task.cohort_id;
      if (cohortId) {
        const { data, error } = await supabase.from('cohorts').select('*').eq('id', cohortId).single();
        if (error) return res.status(500).json({ error: 'Failed to fetch cohort' });
        result.cohort = data;
      }
    }

    if (include.submissions) {
      let query = supabase.from('user_task_completions').select('*').eq('task_id', taskId).order('submitted_at', { ascending: false });
      if (include.status) query = query.eq('status', include.status);
      const limit = clampPageSize(include.limit);
      const offset = include.offset || 0;
      // @ts-ignore
      query = query.range(offset, offset + limit - 1);
      const { data, error } = await query;
      if (error) return res.status(500).json({ error: 'Failed to fetch submissions' });
      result.submissions = data || [];
    }
    return res.status(200).json({ success: true, data: result });
  } catch (error: any) {
    log.error('details error', { error });
    return res.status(500).json({ error: 'Server error' });
  }
}


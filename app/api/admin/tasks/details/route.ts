import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS, clampPageSize } from '@/lib/config/admin';
import { parseIncludeParam } from '@/lib/api/parsers/admin-task-details';

const log = getLogger('api:task-details');

export type IncludeFlags = {
  milestone: boolean;
  cohort: boolean;
  submissions: boolean;
  status?: string;
  limit?: number;
  offset?: number;
};

// moved parsing to a standalone helper for easier testing

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const taskId = url.searchParams.get('task_id');
  if (!taskId) {
    return NextResponse.json({ error: 'task_id is required' }, { status: 400 });
  }
  const include = parseIncludeParam(url.searchParams.get('include'), clampPageSize);

  const supabase = createAdminClient();

  try {
    // Get task
    const getTask = unstable_cache(async (id: string) => {
      const { data, error } = await supabase
        .from('milestone_tasks')
        .select('*')
        .eq('id', id);
      if (error) throw error;
      return data as any[];
    }, ['task', taskId], { tags: [ADMIN_CACHE_TAGS.task(taskId)] });

    const taskRows = await getTask(taskId);
    if (!taskRows || taskRows.length === 0) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    const task = taskRows[0];

    const result: any = { task };

    // Milestone
    let milestone: any = null;
    if (include.milestone) {
      const getMilestone = unstable_cache(async (id: string) => {
        const { data, error } = await supabase
          .from('cohort_milestones')
          .select('*')
          .eq('id', id)
          .single();
        if (error) throw error;
        return data;
      }, ['milestone', task.milestone_id], { tags: [ADMIN_CACHE_TAGS.milestone(task.milestone_id)] });

      milestone = await getMilestone(task.milestone_id);
      result.milestone = milestone;
    }

    // Cohort
    if (include.cohort) {
      const cohortId = milestone?.cohort_id || task.cohort_id;
      if (cohortId) {
        const getCohort = unstable_cache(async (id: string) => {
          const { data, error } = await supabase
            .from('cohorts')
            .select('*')
            .eq('id', id)
            .single();
          if (error) throw error;
          return data;
        }, ['cohort', String(cohortId)], { tags: [ADMIN_CACHE_TAGS.cohort(String(cohortId))] });

        result.cohort = await getCohort(String(cohortId));
      }
    }

    // Submissions (optional)
    if (include.submissions) {
      const limit = clampPageSize(include.limit);
      const offset = include.offset || 0;
      const key = ['submissions', taskId, include.status || 'all', String(limit), String(offset)];
      const getSubs = unstable_cache(async () => {
        let query = supabase
          .from('user_task_completions')
          .select('*')
          .eq('task_id', taskId)
          .order('submitted_at', { ascending: false });
        if (include.status) query = query.eq('status', include.status);
        // @ts-ignore range is valid
        query = query.range(offset, offset + limit - 1);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      }, key, { tags: [ADMIN_CACHE_TAGS.submissions(taskId)] });
      result.submissions = await getSubs();
    }

    // Note: In a full Next 15 app, we would tag this response and use revalidateTag on mutations
    // For now, return the bundle
    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error: any) {
    log.error('task-details error', { error });
    return NextResponse.json({ error: 'Failed to build task details' }, { status: 500 });
  }
}

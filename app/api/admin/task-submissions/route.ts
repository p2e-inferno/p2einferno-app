import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';

const log = getLogger('api:task-submissions');

function invalidate(taskId: string | number | null | undefined) {
  if (!taskId && taskId !== 0) return;
  try { revalidateTag(ADMIN_CACHE_TAGS.submissions(String(taskId)), 'default'); } catch { }
}

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const url = new URL(req.url);
    const taskId = url.searchParams.get('taskId');
    const userId = url.searchParams.get('userId');

    let query = supabase.from('task_submissions').select('*').order('submitted_at', { ascending: false });
    if (taskId) query = query.eq('task_id', taskId);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 });
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('task-submissions GET error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const { id, status, feedback, reviewed_by, reviewed_at } = (await req.json().catch(() => ({}))) as any;
    if (!id) return NextResponse.json({ error: 'Submission ID is required' }, { status: 400 });
    if (!status || !['pending', 'completed', 'failed', 'retry'].includes(status)) {
      return NextResponse.json({ error: 'Valid status is required (pending, completed, failed, retry)' }, { status: 400 });
    }
    const update: any = { status, updated_at: new Date().toISOString() };
    if (feedback !== undefined) update.feedback = feedback;
    if (reviewed_by) update.reviewed_by = reviewed_by;
    if (reviewed_at) update.reviewed_at = reviewed_at;

    const { data, error } = await supabase.from('task_submissions').update(update).eq('id', id).select('*').single();
    if (error) return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 });

    // Reconcile user_task_progress when marking submission as completed
    if (status === 'completed' && data) {
      try {
        // Get user profile from submission's user_id
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('privy_user_id', data.user_id)
          .maybeSingle();

        if (profile) {
          // Fetch milestone_id from the task (needed for UTP insert)
          const { data: task } = await supabase
            .from('milestone_tasks')
            .select('milestone_id')
            .eq('id', data.task_id)
            .maybeSingle();

          if (!task) {
            log.error('Task not found for submission:', {
              submission_id: data.id,
              task_id: data.task_id
            });
          } else {
            // Ensure user_task_progress is synced (trigger should do this, but reconcile if missing)
            const { error: utpError } = await supabase
              .from('user_task_progress')
              .upsert({
                user_profile_id: profile.id,
                milestone_id: task.milestone_id,
                task_id: data.task_id,
                status: 'completed',
                submission_id: data.id,
                completed_at: new Date().toISOString(),
              }, {
                onConflict: 'user_profile_id,task_id',
                ignoreDuplicates: false
              });

            if (utpError) {
              log.error('Failed to reconcile user_task_progress:', utpError);
            }
          }
        } else {
          log.warn('No user profile found for submission:', {
            submission_id: data.id,
            user_id: data.user_id
          });
        }
      } catch (reconcileError) {
        log.error('UTP reconciliation error:', reconcileError);
        // Don't fail the request - submission update already succeeded
      }
    }

    invalidate(data?.task_id);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('task-submissions PUT error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const { task_id, submission_url } = (await req.json().catch(() => ({}))) as any;
    if (!task_id || !submission_url) return NextResponse.json({ error: 'Task ID and submission URL are required' }, { status: 400 });
    try { new URL(submission_url); } catch { return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 }); }
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('task_submissions')
      .insert({ task_id, user_id: 'admin', submission_url, status: 'pending', submitted_at: now, created_at: now, updated_at: now })
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: 'Failed to create submission' }, { status: 500 });
    invalidate(data?.task_id);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    log.error('task-submissions POST error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

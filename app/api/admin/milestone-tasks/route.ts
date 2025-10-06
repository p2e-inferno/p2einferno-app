import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';

const log = getLogger('api:milestone-tasks');

// Helper to revalidate cache tags impacted by task changes
function invalidateForTask(task: any) {
  try {
    if (!task) return;
    if (task.id) revalidateTag(ADMIN_CACHE_TAGS.task(String(task.id)));
    if (task.milestone_id) revalidateTag(ADMIN_CACHE_TAGS.milestone(String(task.milestone_id)));
    if (task.id) revalidateTag(ADMIN_CACHE_TAGS.submissions(String(task.id)));
  } catch (err) {
    // revalidateTag is best-effort; log and continue
    log.warn('revalidateTag failed', { err });
  }
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body) ? body : (Array.isArray(body?.tasks) ? body.tasks : [body]);
    if (!items.length || typeof items[0] !== 'object') {
      return NextResponse.json({ error: 'Invalid body: expected task or tasks[]' }, { status: 400 });
    }
    const { data, error } = await supabase.from('milestone_tasks').insert(items).select('*');
    if (error) {
      log.error('insert milestone_tasks failed', { error });
      
      // Provide more specific error messages
      if (error.code === '23505') {
        return NextResponse.json({ 
          error: 'Duplicate task ID detected. Please refresh and try again.' 
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to create tasks: ' + error.message 
      }, { status: 400 });
    }
    (data || []).forEach(invalidateForTask);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    log.error('milestone-tasks POST error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const body = await req.json().catch(() => ({}));
    const { id, ...update } = body || {};
    if (!id) return NextResponse.json({ error: 'Missing task id' }, { status: 400 });

    const { data, error } = await supabase
      .from('milestone_tasks')
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      log.error('update milestone_tasks failed', { error, id });
      return NextResponse.json({ error: 'Failed to update task' }, { status: 400 });
    }
    invalidateForTask(data);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('milestone-tasks PUT error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    // Fetch task first for invalidation context
    const { data: before } = await supabase.from('milestone_tasks').select('*').eq('id', id).single();
    const { error } = await supabase.from('milestone_tasks').delete().eq('id', id);
    if (error) {
      log.error('delete milestone_tasks failed', { error, id });
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 400 });
    }
    invalidateForTask(before);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    log.error('milestone-tasks DELETE error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Compatibility: temporary redirect for legacy GET callers
export async function GET(req: NextRequest) {
  // We intentionally do not guard here; the target endpoint enforces admin
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const target = new URL(`/api/admin/tasks/by-milestone${qs ? `?${qs}` : ''}`, url.origin);
  return NextResponse.redirect(target, 307);
}

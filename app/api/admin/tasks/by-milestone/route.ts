import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';

const log = getLogger('api:tasks:by-milestone');

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const url = new URL(req.url);
    const milestoneId = url.searchParams.get('milestone_id');
    const id = url.searchParams.get('id');

    if (id) {
      const { data, error } = await supabase
        .from('milestone_tasks')
        .select('*')
        .eq('id', id)
        .single();
      if (error) {
        log.error('fetch milestone_task by id failed', { error, id });
        return NextResponse.json({ error: 'Failed to fetch task' }, { status: 400 });
      }
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    if (!milestoneId) {
      return NextResponse.json({ error: 'Missing milestone_id or id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('milestone_tasks')
      .select('*')
      .eq('milestone_id', milestoneId)
      .order('order_index', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      log.error('fetch milestone_tasks failed', { error, milestoneId });
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('by-milestone GET error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

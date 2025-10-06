import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';

const log = getLogger('api:milestones');

function invalidateMilestone(milestone: any) {
  try {
    if (!milestone) return;
    if (milestone.id) revalidateTag(ADMIN_CACHE_TAGS.milestone(String(milestone.id)));
    if (milestone.cohort_id) revalidateTag(ADMIN_CACHE_TAGS.cohort(String(milestone.cohort_id)));
  } catch (err) {
    log.warn('revalidateTag failed', { err });
  }
}

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const url = new URL(req.url);
    const cohort_id = url.searchParams.get('cohort_id');
    const milestone_id = url.searchParams.get('milestone_id');

    if (milestone_id) {
      const { data, error } = await supabase
        .from('cohort_milestones')
        .select('*')
        .eq('id', milestone_id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
      return NextResponse.json({ success: true, data }, { status: 200 });
    }
    if (!cohort_id) return NextResponse.json({ error: 'Missing cohort ID or milestone ID' }, { status: 400 });
    const { data, error } = await supabase.from('cohort_milestones').select('*').eq('cohort_id', cohort_id).order('order_index');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('milestones GET error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const payload = await req.json();
    const { data, error } = await supabase.from('cohort_milestones').insert(payload).select('*').single();
    if (error) {
      log.error('milestones POST supabase error', {
        error,
        payloadKeys:
          payload && typeof payload === 'object'
            ? Object.keys(payload as Record<string, unknown>)
            : [],
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    invalidateMilestone(data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    log.error('milestones POST error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const { id, ...update } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing milestone ID' }, { status: 400 });
    const { data, error } = await supabase.from('cohort_milestones').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    if (error) {
      log.error('milestones PUT supabase error', {
        error,
        payloadKeys: Object.keys(update ?? {}),
        milestoneId: id,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    invalidateMilestone(data);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('milestones PUT error', { error });
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
    if (!id) return NextResponse.json({ error: 'Missing milestone ID' }, { status: 400 });
    const { data: before } = await supabase.from('cohort_milestones').select('*').eq('id', id).single();
    const { error } = await supabase.from('cohort_milestones').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    invalidateMilestone(before);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    log.error('milestones DELETE error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

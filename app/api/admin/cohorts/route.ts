import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';

const log = getLogger('api:cohorts');

function invalidateCohortCache(cohort?: { id?: string | null }) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.cohortList, 'default');
    if (cohort?.id) {
      revalidateTag(ADMIN_CACHE_TAGS.cohort(String(cohort.id)), 'default');
    }
  } catch (error) {
    log.warn('cohort cache revalidation failed', { error });
  }
}

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const supabase = createAdminClient();
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const lockAddress = url.searchParams.get('lock_address');

    if (id || lockAddress) {
      let query = supabase
        .from('cohorts')
        .select(`
          *,
          bootcamp_program:bootcamp_program_id (
            id,
            name
          )
        `);
      if (id) query = query.eq('id', id);
      if (lockAddress) query = query.eq('lock_address', lockAddress);
      const { data, error } = await query.maybeSingle();
      if (error) {
        log.error('cohorts GET single error', { error, id, lockAddress });
        return NextResponse.json({ error: 'Failed to fetch cohort' }, { status: 500 });
      }
      if (!data) {
        return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    const { data, error } = await supabase
      .from('cohorts')
      .select(`
        *,
        bootcamp_program:bootcamp_program_id (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ success: true, data: data ?? [] }, { status: 200 });
  } catch (error: any) {
    log.error('cohorts GET error', { error });
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch cohorts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  try {
    const cohort = await req.json().catch(() => null);
    if (!cohort || !cohort.id || !cohort.name || !cohort.bootcamp_program_id) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const record: any = {
      ...cohort,
      created_at: cohort.created_at ?? now,
      updated_at: cohort.updated_at ?? now,
    };
    // Harden grant flags: if a lock exists and flag not provided, default to false; clear reason when granted
    if (record.lock_address) {
      if (typeof record.lock_manager_granted === 'undefined' || record.lock_manager_granted === null) {
        record.lock_manager_granted = false;
      }
      if (record.lock_manager_granted === true) {
        record.grant_failure_reason = null;
      }
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('cohorts')
      .insert(record)
      .select()
      .single();

    if (error) {
      log.error('cohorts POST db error', { error });
      return NextResponse.json({ error: error.message || 'Failed to create cohort' }, { status: 400 });
    }

    invalidateCohortCache(data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    log.error('cohorts POST error', { error });
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  try {
    const body = await req.json().catch(() => ({}));
    const { id, bootcamp_program, ...cohort } = body || {};
    if (!id) {
      return NextResponse.json({ error: 'Missing cohort ID' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const update: any = {
      ...cohort,
      updated_at: new Date().toISOString(),
    };
    // Harden grant flags: same rules as POST
    if (update.lock_address) {
      if (typeof update.lock_manager_granted === 'undefined' || update.lock_manager_granted === null) {
        update.lock_manager_granted = false;
      }
      if (update.lock_manager_granted === true) {
        update.grant_failure_reason = null;
      }
    }

    const { data, error } = await supabase
      .from('cohorts')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      log.error('cohorts PUT db error', { error });
      return NextResponse.json({ error: error.message || 'Failed to update cohort' }, { status: 400 });
    }

    invalidateCohortCache(data ?? { id });
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('cohorts PUT error', { error });
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'Missing cohort ID' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('cohorts').delete().eq('id', id);
    if (error) {
      log.error('cohorts DELETE db error', { error, id });
      return NextResponse.json({ error: error.message || 'Failed to delete cohort' }, { status: 400 });
    }

    invalidateCohortCache({ id });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    log.error('cohorts DELETE error', { error });
    return NextResponse.json({ error: error?.message || 'Server error' }, { status: 500 });
  }
}

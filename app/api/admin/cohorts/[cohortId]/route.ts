import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';

const log = getLogger('api:cohorts:detail');

function invalidateCohort(id: string) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.cohort(id));
  } catch (error) {
    log.warn('cohort revalidation failed', { error, id });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { cohortId } = await params;
  if (!cohortId) {
    return NextResponse.json({ error: 'Invalid cohort ID' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    const maxRetries = 3;
    let retryCount = 0;
    let cohort: any = null;
    let cohortError: any = null;

    while (retryCount < maxRetries) {
      try {
        const result = await supabase
          .from('cohorts')
          .select(`
            id,
            name,
            start_date,
            end_date,
            max_participants,
            current_participants,
            registration_deadline,
            status,
            bootcamp_program_id,
            key_managers,
            lock_address,
            usdt_amount,
            naira_amount,
            created_at,
            updated_at,
            bootcamp_programs!cohorts_bootcamp_program_id_fkey (
              id,
              name,
              description,
              duration_weeks,
              max_reward_dgt
            )
          `)
          .eq('id', cohortId)
          .maybeSingle();

        cohort = result.data;
        cohortError = result.error;
        break;
      } catch (error: any) {
        retryCount += 1;
        log.warn('[COHORT_API] Database connection failed', {
          attempt: retryCount,
          maxRetries,
          error,
        });

        if (retryCount >= maxRetries) {
          cohortError = {
            message: 'Database connection failed after retries',
            details: error instanceof Error ? error.message : 'Network error',
          };
          cohort = null;
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }

    if (cohortError) {
      log.error('cohort detail fetch error', { error: cohortError, cohortId });
      return NextResponse.json(
        { error: 'Database error', details: cohortError.message },
        { status: 500 }
      );
    }

    if (!cohort) {
      log.error('cohort not found', { cohortId });
      return NextResponse.json({ error: 'Cohort not found', cohortId }, { status: 404 });
    }

    const response = {
      id: cohort.id,
      name: cohort.name,
      start_date: cohort.start_date,
      end_date: cohort.end_date,
      max_participants: cohort.max_participants,
      current_participants: cohort.current_participants,
      registration_deadline: cohort.registration_deadline,
      status: cohort.status,
      bootcamp_program_id: cohort.bootcamp_program_id,
      key_managers: cohort.key_managers,
      lock_address: cohort.lock_address,
      usdt_amount: cohort.usdt_amount,
      naira_amount: cohort.naira_amount,
      created_at: cohort.created_at,
      updated_at: cohort.updated_at,
      bootcamp_program: Array.isArray(cohort.bootcamp_programs)
        ? cohort.bootcamp_programs[0]
        : cohort.bootcamp_programs,
    };

    return NextResponse.json({ success: true, data: response }, { status: 200 });
  } catch (error: any) {
    log.error('cohort detail unexpected error', { error, cohortId });
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ cohortId: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { cohortId } = await params;
  if (!cohortId) {
    return NextResponse.json({ error: 'Cohort ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    const updates = await req.json();

    // Remove cohortId from updates if it exists (shouldn't update ID)
    const { id, cohortId: _, ...safeUpdates } = updates;

    const { data, error } = await supabase
      .from('cohorts')
      .update({
        ...safeUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cohortId)
      .select()
      .single();

    if (error) {
      log.error('cohort update error', { error, cohortId });
      return NextResponse.json(
        { error: error.message || 'Failed to update cohort' },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Cohort not found' }, { status: 404 });
    }

    invalidateCohort(cohortId);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('cohort update unexpected error', { error, cohortId });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

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
    if (milestone.id) revalidateTag(ADMIN_CACHE_TAGS.milestone(String(milestone.id)), 'default');
    if (milestone.cohort_id) revalidateTag(ADMIN_CACHE_TAGS.cohort(String(milestone.cohort_id)), 'default');
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
      log.debug('milestones GET by id', { milestone_id });
      const { data, error } = await supabase
        .from('cohort_milestones')
        .select('*')
        .eq('id', milestone_id)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      if (!data) return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
      // Add targeted visibility for lock manager fields to help debug retry button
      try {
        log.info('milestones GET result (lock manager fields)', {
          id: data?.id,
          hasLockAddress: Boolean(data?.lock_address),
          lockAddress: data?.lock_address ?? null,
          lockManagerGranted: (data as any)?.lock_manager_granted,
          lockManagerGrantedType: typeof (data as any)?.lock_manager_granted,
          grantFailureReason: (data as any)?.grant_failure_reason ?? null,
        });
      } catch (e) {
        log.warn('milestones GET logging failed', { e });
      }
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

/**
 * Creates a new cohort milestone, persists it to the database, invalidates related caches, and returns the created milestone.
 *
 * Performs a cohort certificate check (when BOOTCAMP_CERTIFICATES_ENABLED = 'true') to prevent adding milestones after certificates have been issued. When the payload includes a `lock_address`, boolean lock-related flags are normalized and associated failure-reason fields are cleared as appropriate. Requires an admin caller.
 *
 * @returns JSON response containing the created milestone record on success; `201` on success, `409` if certificates have already been issued for the cohort, `400` for validation/insert errors, or `500` for server errors.
 */
export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const payload = await req.json();
    // Shallow log of incoming payload (without large blobs)
    try {
      const keys = payload && typeof payload === 'object' ? Object.keys(payload as Record<string, unknown>) : [];
      log.info('milestones POST payload received', {
        keys,
        hasLockAddress: Boolean(payload?.lock_address),
        lockManagerGranted: payload?.lock_manager_granted,
        grantFailureReason: payload?.grant_failure_reason ?? null,
      });
    } catch (e) {
      log.warn('milestones POST payload logging failed', { e });
    }
    // Prevent adding milestones after certificates are issued for the cohort
    try {
      if (process.env.BOOTCAMP_CERTIFICATES_ENABLED === 'true' && payload?.cohort_id) {
        const { data: issued } = await supabase
          .from('bootcamp_enrollments')
          .select('id')
          .eq('cohort_id', payload.cohort_id)
          .eq('certificate_issued', true)
          .limit(1);
        if (issued && issued.length > 0) {
          return NextResponse.json({ error: 'Cannot add milestones after certificates have been issued for this cohort' }, { status: 409 });
        }
      }
    } catch { }

    // Harden grant flags when lock_address present
    const insertPayload: any = { ...payload };
    if (insertPayload.lock_address) {
      if (typeof insertPayload.lock_manager_granted === 'undefined' || insertPayload.lock_manager_granted === null) {
        insertPayload.lock_manager_granted = false;
      }
      if (insertPayload.lock_manager_granted === true) {
        insertPayload.grant_failure_reason = null;
      }

      // Harden max_keys_secured flag
      if (typeof insertPayload.max_keys_secured === 'undefined' || insertPayload.max_keys_secured === null) {
        insertPayload.max_keys_secured = false;
      }
      if (insertPayload.max_keys_secured === true) {
        insertPayload.max_keys_failure_reason = null;
      }

      // Harden transferability_secured flag
      if (typeof insertPayload.transferability_secured === 'undefined' || insertPayload.transferability_secured === null) {
        insertPayload.transferability_secured = false;
      }
      if (insertPayload.transferability_secured === true) {
        insertPayload.transferability_failure_reason = null;
      }
    }
    const { data, error } = await supabase.from('cohort_milestones').insert(insertPayload).select('*').single();
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
    try {
      log.info('milestones POST inserted row (lock manager fields)', {
        id: data?.id,
        hasLockAddress: Boolean(data?.lock_address),
        lockAddress: data?.lock_address ?? null,
        lockManagerGranted: (data as any)?.lock_manager_granted,
        lockManagerGrantedType: typeof (data as any)?.lock_manager_granted,
        grantFailureReason: (data as any)?.grant_failure_reason ?? null,
      });
    } catch { }
    invalidateMilestone(data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    log.error('milestones POST error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * Update an existing cohort milestone and invalidate related admin caches.
 *
 * Applies hardened defaults for lock-manager and max-keys flags when a `lock_address` is present,
 * updates the milestone row, and triggers cache revalidation for the affected milestone and cohort.
 *
 * @returns `{ success: true, data }` with the updated milestone on success, or `{ error: string }` describing the failure.
 */
export async function PUT(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;
  const supabase = createAdminClient();
  try {
    const { id, ...update } = await req.json();
    if (!id) return NextResponse.json({ error: 'Missing milestone ID' }, { status: 400 });
    try {
      log.info('milestones PUT payload', {
        id,
        keys: Object.keys(update ?? {}),
        hasLockAddress: Boolean(update?.lock_address),
        lockManagerGranted: update?.lock_manager_granted,
        grantFailureReason: update?.grant_failure_reason ?? null,
      });
    } catch { }
    const hardened: any = { ...update, updated_at: new Date().toISOString() };
    const hasMaxKeysSecured = Object.prototype.hasOwnProperty.call(
      update ?? {},
      'max_keys_secured',
    );
    const hasTransferabilitySecured = Object.prototype.hasOwnProperty.call(
      update ?? {},
      'transferability_secured',
    );
    if (hardened.lock_address) {
      if (typeof hardened.lock_manager_granted === 'undefined' || hardened.lock_manager_granted === null) {
        hardened.lock_manager_granted = false;
      }
      if (hardened.lock_manager_granted === true) {
        hardened.grant_failure_reason = null;
      }

      // Harden max_keys_secured flag
      if (hasMaxKeysSecured && (typeof hardened.max_keys_secured === 'undefined' || hardened.max_keys_secured === null)) {
        hardened.max_keys_secured = false;
      }
      if (hasMaxKeysSecured && hardened.max_keys_secured === true) {
        hardened.max_keys_failure_reason = null;
      }

      // Harden transferability_secured flag
      if (
        hasTransferabilitySecured &&
        (typeof hardened.transferability_secured === 'undefined' || hardened.transferability_secured === null)
      ) {
        hardened.transferability_secured = false;
      }
      if (hasTransferabilitySecured && hardened.transferability_secured === true) {
        hardened.transferability_failure_reason = null;
      }
    }
    const { data, error } = await supabase.from('cohort_milestones').update(hardened).eq('id', id).select('*').single();
    if (error) {
      log.error('milestones PUT supabase error', {
        error,
        payloadKeys: Object.keys(update ?? {}),
        milestoneId: id,
      });
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    try {
      log.info('milestones PUT updated row (lock manager fields)', {
        id: data?.id,
        hasLockAddress: Boolean(data?.lock_address),
        lockAddress: data?.lock_address ?? null,
        lockManagerGranted: (data as any)?.lock_manager_granted,
        lockManagerGrantedType: typeof (data as any)?.lock_manager_granted,
        grantFailureReason: (data as any)?.grant_failure_reason ?? null,
      });
    } catch { }
    invalidateMilestone(data);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('milestones PUT error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * Delete a cohort milestone identified by the `id` query parameter and invalidate its related caches.
 *
 * Requires admin privileges; if the caller is not an admin, the guard response is returned. If the milestone is found and deleted, related cache tags are invalidated via `invalidateMilestone`.
 *
 * @returns `success: true` on successful deletion; otherwise an object with an `error` message describing the failure (status codes convey the error type, e.g., 400 for bad requests or 500 for server errors).
 */
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

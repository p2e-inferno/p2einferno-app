import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';

const log = getLogger('api:bootcamps:detail');

function invalidateBootcamp(id: string) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.bootcampList, 'default');
    revalidateTag(ADMIN_CACHE_TAGS.bootcamp(id), 'default');
  } catch (error) {
    log.warn('bootcamp revalidation failed', { error, id });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Bootcamp ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const { data, error } = await supabase
      .from('bootcamp_programs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      log.error('bootcamp detail error', { error, id });
      return NextResponse.json({ error: error.message || 'Failed to fetch bootcamp' }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Bootcamp not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamp detail unexpected error', { error, id });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Bootcamp ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  try {
    const { error } = await supabase
      .from('bootcamp_programs')
      .delete()
      .eq('id', id);

    if (error) {
      log.error('bootcamp delete error', { error, id });
      return NextResponse.json({ error: error.message || 'Failed to delete bootcamp' }, { status: 400 });
    }

    invalidateBootcamp(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamp delete unexpected error', { error, id });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Bootcamp ID is required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    const updates = await req.json();

    // Remove id from updates if it exists (shouldn't update ID)
    const { id: _, ...safeUpdates } = updates;
    const hardened: any = {
      ...safeUpdates,
      updated_at: new Date().toISOString(),
    };

    const hasMaxKeysSecured = Object.prototype.hasOwnProperty.call(
      safeUpdates ?? {},
      "max_keys_secured",
    );
    const hasTransferabilitySecured = Object.prototype.hasOwnProperty.call(
      safeUpdates ?? {},
      "transferability_secured",
    );
    const hasLockAddressField = Object.prototype.hasOwnProperty.call(
      safeUpdates ?? {},
      "lock_address",
    );

    let lockAddressChanged = false;
    if (hasLockAddressField) {
      const normalizeLockAddress = (value: unknown) =>
        typeof value === "string" && value.trim() ? value.trim() : null;
      const { data: existing, error: existingError } = await supabase
        .from("bootcamp_programs")
        .select("lock_address")
        .eq("id", id)
        .maybeSingle();
      if (existingError) {
        log.error("bootcamp update prefetch error", { error: existingError, id });
        return NextResponse.json(
          { error: existingError.message || "Failed to update bootcamp" },
          { status: 500 },
        );
      }
      lockAddressChanged =
        normalizeLockAddress((existing as any)?.lock_address) !==
        normalizeLockAddress(hardened.lock_address);
    }

    // Harden flags when lock_address present
    if (hardened.lock_address) {
      if (typeof hardened.lock_manager_granted === "undefined" || hardened.lock_manager_granted === null) {
        hardened.lock_manager_granted = false;
      }
      if (hardened.lock_manager_granted === true) {
        hardened.grant_failure_reason = null;
      }

      if (
        (hasMaxKeysSecured || lockAddressChanged) &&
        (typeof hardened.max_keys_secured === "undefined" ||
          hardened.max_keys_secured === null)
      ) {
        hardened.max_keys_secured = false;
      }
      if ((hasMaxKeysSecured || lockAddressChanged) && hardened.max_keys_secured === true) {
        hardened.max_keys_failure_reason = null;
      }

      if (
        (hasTransferabilitySecured || lockAddressChanged) &&
        (typeof hardened.transferability_secured === "undefined" ||
          hardened.transferability_secured === null)
      ) {
        hardened.transferability_secured = false;
      }
      if (
        (hasTransferabilitySecured || lockAddressChanged) &&
        hardened.transferability_secured === true
      ) {
        hardened.transferability_failure_reason = null;
      }
    }

    const { data, error } = await supabase
      .from('bootcamp_programs')
      .update({
        ...hardened,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      log.error('bootcamp update error', { error, id });
      return NextResponse.json(
        { error: error.message || 'Failed to update bootcamp' },
        { status: 400 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: 'Bootcamp not found' }, { status: 404 });
    }

    invalidateBootcamp(id);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamp update unexpected error', { error, id });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

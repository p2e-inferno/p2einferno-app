import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_CACHE_TAGS } from '@/lib/app-config/admin';
import type { BootcampProgram } from '@/lib/supabase/types';

const log = getLogger('api:bootcamps');

function invalidateBootcampCache(bootcamp?: Partial<BootcampProgram> | null) {
  try {
    revalidateTag(ADMIN_CACHE_TAGS.bootcampList, 'default');
    if (bootcamp?.id) {
      revalidateTag(ADMIN_CACHE_TAGS.bootcamp(String(bootcamp.id)), 'default');
    }
  } catch (error) {
    log.warn('bootcamp cache revalidation failed', { error });
  }
}

type BootcampPayload = Partial<BootcampProgram> & { id?: string };

type ValidationResult = {
  isValid: boolean;
  message?: string;
  details?: string[];
};

function validateCreatePayload(payload: BootcampPayload): ValidationResult {
  if (!payload) {
    return { isValid: false, message: 'No bootcamp data provided' };
  }

  const missingFields: string[] = [];
  if (!payload.id) missingFields.push('id');
  if (!payload.name) missingFields.push('name');
  if (!payload.description) missingFields.push('description');
  if (payload.duration_weeks === undefined || payload.duration_weeks === null) missingFields.push('duration_weeks');
  if (payload.max_reward_dgt === undefined || payload.max_reward_dgt === null) missingFields.push('max_reward_dgt');

  if (missingFields.length > 0) {
    return {
      isValid: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
      details: missingFields,
    };
  }

  if (typeof payload.duration_weeks !== 'number' || payload.duration_weeks < 1) {
    return { isValid: false, message: 'duration_weeks must be a positive number' };
  }

  if (typeof payload.max_reward_dgt !== 'number' || payload.max_reward_dgt < 0) {
    return { isValid: false, message: 'max_reward_dgt must be a non-negative number' };
  }

  return { isValid: true };
}

function validateUpdatePayload(payload: BootcampPayload): ValidationResult {
  if (!payload?.id) {
    return { isValid: false, message: 'Bootcamp ID is required' };
  }

  if (payload.duration_weeks !== undefined) {
    if (typeof payload.duration_weeks !== 'number' || payload.duration_weeks < 1) {
      return { isValid: false, message: 'duration_weeks must be a positive number' };
    }
  }

  if (payload.max_reward_dgt !== undefined) {
    if (typeof payload.max_reward_dgt !== 'number' || payload.max_reward_dgt < 0) {
      return { isValid: false, message: 'max_reward_dgt must be a non-negative number' };
    }
  }

  return { isValid: true };
}

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from('bootcamp_programs')
      .select('*')
      .order('name');

    if (error) {
      log.error('bootcamps GET error', { error });
      return NextResponse.json({ success: false, error: error.message || 'Failed to fetch bootcamps' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamps GET unexpected error', { error });
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  try {
    const payload = (await req.json()) as BootcampPayload;
    const validation = validateCreatePayload(payload);
    if (!validation.isValid) {
      log.warn('bootcamp create validation failed', { message: validation.message, details: validation.details });
      return NextResponse.json(
        {
          error: validation.message || 'Missing required fields',
          details: validation.details,
        },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const record: any = {
      ...payload,
      created_at: payload.created_at ?? now,
      updated_at: payload.updated_at ?? now,
    };
    // Harden grant flags: if a lock exists and flag not provided, default to false; clear reason when granted
    if (record.lock_address) {
      if (typeof record.lock_manager_granted === 'undefined' || record.lock_manager_granted === null) {
        record.lock_manager_granted = false;
      }
      if (record.lock_manager_granted === true) {
        record.grant_failure_reason = null;
      }

      // Harden max_keys_secured flag
      if (typeof record.max_keys_secured === 'undefined' || record.max_keys_secured === null) {
        record.max_keys_secured = false;
      }
      if (record.max_keys_secured === true) {
        record.max_keys_failure_reason = null;
      }

      // Harden transferability_secured flag
      if (typeof record.transferability_secured === 'undefined' || record.transferability_secured === null) {
        record.transferability_secured = false;
      }
      if (record.transferability_secured === true) {
        record.transferability_failure_reason = null;
      }
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('bootcamp_programs')
      .insert([record])
      .select()
      .single();

    if (error) {
      log.error('bootcamp create db error', { error });
      return NextResponse.json(
        { error: error.message || 'Failed to create bootcamp', details: error.details },
        { status: 500 }
      );
    }

    invalidateBootcampCache(data);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    log.error('bootcamp create unexpected error', { error });
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  try {
    const payload = (await req.json()) as BootcampPayload;
    const validation = validateUpdatePayload(payload);
    if (!validation.isValid) {
      log.warn('bootcamp update validation failed', { message: validation.message });
      return NextResponse.json(
        { error: validation.message || 'Invalid bootcamp data' },
        { status: 400 }
      );
    }

    const { id, ...updates } = payload;
    const updateData: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    const supabase = createAdminClient();

    const hasMaxKeysSecured = Object.prototype.hasOwnProperty.call(
      updates ?? {},
      "max_keys_secured",
    );
    const hasTransferabilitySecured = Object.prototype.hasOwnProperty.call(
      updates ?? {},
      "transferability_secured",
    );
    const hasLockAddressField = Object.prototype.hasOwnProperty.call(
      updates ?? {},
      "lock_address",
    );

    // If lock address is being changed, default security flags to false unless explicitly provided.
    // If lock address is unchanged and the client omits these fields, preserve DB truth (avoid clobbering synced state).
    let lockAddressChanged = false;
    if (hasLockAddressField) {
      const normalizeLockAddress = (value: unknown) =>
        typeof value === "string" && value.trim() ? value.trim() : null;
      const { data: existing, error: existingError } = await supabase
        .from("bootcamp_programs")
        .select("lock_address")
        .eq("id", id as string)
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
        normalizeLockAddress(updateData.lock_address);
    }

    if (updateData.lock_address) {
      if (typeof updateData.lock_manager_granted === 'undefined' || updateData.lock_manager_granted === null) {
        updateData.lock_manager_granted = false;
      }
      if (updateData.lock_manager_granted === true) {
        updateData.grant_failure_reason = null;
      }

      // Harden max_keys_secured flag
      if (
        (hasMaxKeysSecured || lockAddressChanged) &&
        (typeof updateData.max_keys_secured === "undefined" ||
          updateData.max_keys_secured === null)
      ) {
        updateData.max_keys_secured = false;
      }
      if ((hasMaxKeysSecured || lockAddressChanged) && updateData.max_keys_secured === true) {
        updateData.max_keys_failure_reason = null;
      }

      // Harden transferability_secured flag
      if (
        (hasTransferabilitySecured || lockAddressChanged) &&
        (typeof updateData.transferability_secured === "undefined" ||
          updateData.transferability_secured === null)
      ) {
        updateData.transferability_secured = false;
      }
      if (
        (hasTransferabilitySecured || lockAddressChanged) &&
        updateData.transferability_secured === true
      ) {
        updateData.transferability_failure_reason = null;
      }
    }

    const { data, error } = await supabase
      .from('bootcamp_programs')
      .update(updateData)
      .eq('id', id as string)
      .select()
      .single();

    if (error) {
      log.error('bootcamp update db error', { error });
      return NextResponse.json(
        { error: error.message || 'Failed to update bootcamp', details: error.details },
        { status: 500 }
      );
    }

    invalidateBootcampCache(data);
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error: any) {
    log.error('bootcamp update unexpected error', { error });
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 });
  }
}

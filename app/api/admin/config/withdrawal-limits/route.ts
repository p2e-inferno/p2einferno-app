/**
 * Withdrawal Limits Configuration API
 *
 * GET: Returns current withdrawal limits (admin-only; use /api/config/withdrawal-limits for public reads)
 * PUT: Updates withdrawal limits (requires admin session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin:config:withdrawal-limits');

/**
 * GET - Fetch current withdrawal limits
 * Admin endpoint; public reads should use /api/config/withdrawal-limits
 */
export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard;

    const supabase = createAdminClient();

    // Fetch withdrawal limit config values
    const { data, error } = await supabase
      .from('system_config')
      .select('key, value, updated_at, updated_by')
      .in('key', ['dg_withdrawal_min_amount', 'dg_withdrawal_max_daily_amount']);

    if (error) {
      log.error('Failed to fetch withdrawal limits', { error });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch limits' },
        { status: 500 }
      );
    }

    // Transform array to object
    const limits = {
      minAmount: 3000, // defaults
      maxAmount: 100000,
      updatedAt: null as string | null,
      updatedBy: null as string | null
    };

    data?.forEach(row => {
      if (row.key === 'dg_withdrawal_min_amount') {
        limits.minAmount = parseInt(row.value);
        limits.updatedAt = row.updated_at;
        limits.updatedBy = row.updated_by;
      } else if (row.key === 'dg_withdrawal_max_daily_amount') {
        limits.maxAmount = parseInt(row.value);
        if (!limits.updatedAt || (row.updated_at && row.updated_at > limits.updatedAt)) {
          limits.updatedAt = row.updated_at;
          limits.updatedBy = row.updated_by;
        }
      }
    });

    return NextResponse.json({
      success: true,
      limits
    });
  } catch (error) {
    log.error('Withdrawal limits GET failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update withdrawal limits
 * Requires admin authentication
 */
export async function PUT(req: NextRequest) {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard;

    // Authenticate admin user
    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request
    const { minAmount, maxAmount } = await req.json();

    // Validate inputs
    if (typeof minAmount !== 'number' || typeof maxAmount !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid input: amounts must be numbers' },
        { status: 400 }
      );
    }

    if (minAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Minimum amount must be greater than 0' },
        { status: 400 }
      );
    }

    if (maxAmount <= minAmount) {
      return NextResponse.json(
        { success: false, error: 'Maximum amount must be greater than minimum amount' },
        { status: 400 }
      );
    }

    if (maxAmount > 1000000) {
      return NextResponse.json(
        { success: false, error: 'Maximum amount cannot exceed 1,000,000 DG' },
        { status: 400 }
      );
    }

    // Get IP and user agent for audit
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const supabase = createAdminClient();

    // Update minimum amount
    const { error: minError } = await supabase
      .from('system_config')
      .update({
        value: minAmount.toString(),
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('key', 'dg_withdrawal_min_amount');

    if (minError) {
      log.error('Failed to update min amount', { error: minError });
      return NextResponse.json(
        { success: false, error: 'Failed to update minimum amount' },
        { status: 500 }
      );
    }

    // Update maximum amount
    const { error: maxError } = await supabase
      .from('system_config')
      .update({
        value: maxAmount.toString(),
        updated_at: new Date().toISOString(),
        updated_by: user.id
      })
      .eq('key', 'dg_withdrawal_max_daily_amount');

    if (maxError) {
      log.error('Failed to update max amount', { error: maxError });
      return NextResponse.json(
        { success: false, error: 'Failed to update maximum amount' },
        { status: 500 }
      );
    }

    // Manually log to audit (trigger handles this for updates, but let's add IP and user agent)
    await supabase.from('config_audit_log').insert([
      {
        config_key: 'dg_withdrawal_limits_batch',
        new_value: JSON.stringify({ minAmount, maxAmount }),
        changed_by: user.id,
        ip_address: ipAddress,
        user_agent: userAgent
      }
    ]);

    log.info('Withdrawal limits updated', {
      minAmount,
      maxAmount,
      userId: user.id
    });

    return NextResponse.json({
      success: true,
      limits: { minAmount, maxAmount },
      message: 'Limits updated successfully'
    });
  } catch (error) {
    log.error('Withdrawal limits PUT failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

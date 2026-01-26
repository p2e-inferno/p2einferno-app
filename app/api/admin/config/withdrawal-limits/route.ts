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
import { isEASEnabled } from '@/lib/attestation/core/config';
import type { DelegatedAttestationSignature } from '@/lib/attestation/api/types';
import { handleGaslessAttestation } from '@/lib/attestation/api/helpers';
import { buildEasScanLink } from '@/lib/attestation/core/network-config';

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
    const { minAmount, maxAmount, attestationSignature } = (await req.json()) as {
      minAmount: number;
      maxAmount: number;
      attestationSignature?: DelegatedAttestationSignature | null;
    };

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

    // Capture current limits so the batch audit row can show old -> new.
    // (The DB trigger may also write per-key audit rows, but the UI defaults to the batch row.)
    const { data: previousRows, error: previousErr } = await supabase
      .from('system_config')
      .select('key, value')
      .in('key', ['dg_withdrawal_min_amount', 'dg_withdrawal_max_daily_amount']);

    if (previousErr) {
      log.warn('Failed to fetch current withdrawal limits before update', { error: previousErr });
    }

    const previousLimits = {
      minAmount: null as number | null,
      maxAmount: null as number | null,
    };

    previousRows?.forEach((row) => {
      if (row.key === 'dg_withdrawal_min_amount') {
        const parsed = parseInt(row.value);
        previousLimits.minAmount = Number.isFinite(parsed) ? parsed : null;
      } else if (row.key === 'dg_withdrawal_max_daily_amount') {
        const parsed = parseInt(row.value);
        previousLimits.maxAmount = Number.isFinite(parsed) ? parsed : null;
      }
    });

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

    // Gasless attestation (admin audit) - best-effort by design for this admin config update.
    // This avoids introducing rollback complexity if EAS is temporarily unavailable.
    const activeWallet = req.headers.get('x-active-wallet') || '';
    let attestationUid: string | null = null;
    let attestationScanUrl: string | null = null;

    if (isEASEnabled() && !activeWallet) {
      log.warn('EAS enabled but X-Active-Wallet header missing; skipping attestation');
    } else if (activeWallet) {
      const attestationResult = await handleGaslessAttestation({
        signature: attestationSignature ?? null,
        schemaKey: 'dg_config_change',
        recipient: activeWallet,
        gracefulDegrade: true,
      });

      if (attestationResult.success && attestationResult.uid) {
        attestationUid = attestationResult.uid;
        attestationScanUrl = await buildEasScanLink(attestationUid);
      }
    }

    // Manually log to audit (trigger handles this for updates, but let's add IP and user agent)
    await supabase.from('config_audit_log').insert([
      {
        config_key: 'dg_withdrawal_limits_batch',
        old_value: JSON.stringify(previousLimits),
        new_value: JSON.stringify({ minAmount, maxAmount }),
        changed_by: user.id,
        ip_address: ipAddress,
        user_agent: userAgent,
        attestation_uid: attestationUid
      }
    ]);

    log.info('Withdrawal limits updated', {
      minAmount,
      maxAmount,
      userId: user.id,
      attestationUid
    });

    return NextResponse.json({
      success: true,
      limits: { minAmount, maxAmount },
      message: 'Limits updated successfully',
      attestationUid,
      attestationScanUrl
    });
  } catch (error) {
    log.error('Withdrawal limits PUT failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

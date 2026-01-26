/**
 * GET /api/admin/config/withdrawal-limits/audit
 *
 * Returns audit history of withdrawal limit changes.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';
import { buildEasScanLink } from '@/lib/attestation/core/network-config';

const log = getLogger('api:admin:config:withdrawal-limits:audit');

function parseOptionalInt(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard;

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    // Default to the "batch" audit row we write in the route handler.
    // This avoids showing multiple trigger-generated rows for the same save action.
    const includeRawKeyChanges = searchParams.get('includeRawKeyChanges') === '1';

    const supabase = createAdminClient();

    // Fetch audit logs for withdrawal limit configs
    let query = supabase
      .from('config_audit_log')
      .select(
        `
        id,
        config_key,
        old_value,
        new_value,
        changed_by,
        changed_at,
        ip_address,
        user_agent,
        attestation_uid
      `,
        { count: 'exact' },
      )
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    query = includeRawKeyChanges
      ? query.or(
          'config_key.eq.dg_withdrawal_min_amount,config_key.eq.dg_withdrawal_max_daily_amount,config_key.eq.dg_withdrawal_limits_batch',
        )
      : query.eq('config_key', 'dg_withdrawal_limits_batch');

    const { data, error, count } = await query;

    if (error) {
      log.error('Failed to fetch audit logs', { error });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit history' },
        { status: 500 }
      );
    }

    // If the batch row lacks old_value (older rows created before we started populating it),
    // infer old values from the trigger-generated per-key audit rows nearby in time.
    const batchEntriesNeedingOld = includeRawKeyChanges
      ? []
      : (data ?? []).filter(
          (entry) => entry.config_key === 'dg_withdrawal_limits_batch' && !entry.old_value,
        );

    let rawKeyAuditRows: Array<{
      config_key: string;
      old_value: string | null;
      new_value: string;
      changed_by: string;
      changed_at: string;
    }> = [];

    if (batchEntriesNeedingOld.length > 0) {
      const times = batchEntriesNeedingOld
        .map((e) => new Date(e.changed_at).getTime())
        .filter((t) => Number.isFinite(t));

      if (times.length > 0) {
        const windowMs = 2 * 60 * 1000;
        const earliest = new Date(Math.min(...times) - windowMs).toISOString();
        const latest = new Date(Math.max(...times) + windowMs).toISOString();

        const { data: rawRows, error: rawErr } = await supabase
          .from('config_audit_log')
          .select('config_key,old_value,new_value,changed_by,changed_at')
          .in('config_key', [
            'dg_withdrawal_min_amount',
            'dg_withdrawal_max_daily_amount',
          ])
          .in(
            'changed_by',
            Array.from(new Set(batchEntriesNeedingOld.map((e) => e.changed_by))),
          )
          .gte('changed_at', earliest)
          .lte('changed_at', latest);

        if (rawErr) {
          log.warn('Failed to fetch raw audit rows for old-value inference', { rawErr });
        } else {
          rawKeyAuditRows = (rawRows as any) ?? [];
        }
      }
    }

    const changedByIds = Array.from(
      new Set((data ?? []).map((entry) => entry.changed_by).filter(Boolean)),
    );

    const walletByPrivyUserId = new Map<string, string>();
    if (changedByIds.length > 0) {
      const { data: profiles, error: profileErr } = await supabase
        .from('user_profiles')
        .select('privy_user_id,wallet_address')
        .in('privy_user_id', changedByIds);

      if (profileErr) {
        log.warn('Failed to resolve changed_by wallet addresses', { profileErr });
      } else {
        for (const profile of profiles ?? []) {
          if (profile?.privy_user_id && profile?.wallet_address) {
            walletByPrivyUserId.set(profile.privy_user_id, profile.wallet_address);
          }
        }
      }
    }

    // Transform data to include user email if available
    const transformedData = await Promise.all(
      (data ?? []).map(async (entry) => {
        // Try to parse old/new values if they're JSON
        let oldValue: unknown = entry.old_value;
        let newValue: unknown = entry.new_value;

        try {
          if (entry.config_key === 'dg_withdrawal_limits_batch') {
            oldValue = entry.old_value ? JSON.parse(entry.old_value) : null;
            newValue = entry.new_value ? JSON.parse(entry.new_value) : null;
          }
        } catch {
          // Keep as string if not JSON
        }

        if (
          entry.config_key === 'dg_withdrawal_limits_batch' &&
          rawKeyAuditRows.length > 0
        ) {
          const hasMin =
            typeof (oldValue as any)?.minAmount === 'number' ||
            typeof (oldValue as any)?.minAmount === 'string';
          const hasMax =
            typeof (oldValue as any)?.maxAmount === 'number' ||
            typeof (oldValue as any)?.maxAmount === 'string';

          if (!hasMin || !hasMax) {
            const targetTime = new Date(entry.changed_at).getTime();
            const candidates = rawKeyAuditRows.filter(
              (row) => row.changed_by === entry.changed_by,
            );

            const pickClosest = (configKey: string) => {
              let best: (typeof candidates)[number] | null = null;
              let bestDelta = Number.POSITIVE_INFINITY;
              for (const row of candidates) {
                if (row.config_key !== configKey) continue;
                const rowTime = new Date(row.changed_at).getTime();
                const delta = Math.abs(rowTime - targetTime);
                if (delta < bestDelta) {
                  bestDelta = delta;
                  best = row;
                }
              }
              return best;
            };

            const minRow = pickClosest('dg_withdrawal_min_amount');
            const maxRow = pickClosest('dg_withdrawal_max_daily_amount');

            const inferred = {
              minAmount: parseOptionalInt(minRow?.old_value),
              maxAmount: parseOptionalInt(maxRow?.old_value),
            };

            oldValue = oldValue && typeof oldValue === 'object'
              ? { ...inferred, ...(oldValue as any) }
              : inferred;
          }
        }

        const attestationUid = entry.attestation_uid ?? null;
        const attestationScanUrl = attestationUid
          ? await buildEasScanLink(attestationUid)
          : null;

        return {
          id: entry.id,
          configKey: entry.config_key,
          oldValue,
          newValue,
          changedBy: entry.changed_by,
          changedByWallet: walletByPrivyUserId.get(entry.changed_by) ?? null,
          changedAt: entry.changed_at,
          ipAddress: entry.ip_address,
          userAgent: entry.user_agent,
          attestationUid,
          attestationScanUrl,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      auditLogs: transformedData,
      total: count,
      limit,
      offset
    });
  } catch (error) {
    log.error('Audit logs request failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

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

const log = getLogger('api:admin:config:withdrawal-limits:audit');

export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard;

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createAdminClient();

    // Fetch audit logs for withdrawal limit configs
    const { data, error, count } = await supabase
      .from('config_audit_log')
      .select(`
        *,
        auth_users:changed_by (
          id
        )
      `, { count: 'exact' })
      .or('config_key.eq.dg_withdrawal_min_amount,config_key.eq.dg_withdrawal_max_daily_amount,config_key.eq.dg_withdrawal_limits_batch')
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Failed to fetch audit logs', { error });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit history' },
        { status: 500 }
      );
    }

    // Transform data to include user email if available
    const transformedData = data?.map(entry => {
      // Try to parse old/new values if they're JSON
      let oldValue = entry.old_value;
      let newValue = entry.new_value;

      try {
        if (entry.config_key === 'dg_withdrawal_limits_batch') {
          oldValue = entry.old_value ? JSON.parse(entry.old_value) : null;
          newValue = JSON.parse(entry.new_value);
        }
      } catch (e) {
        // Keep as string if not JSON
      }

      return {
        id: entry.id,
        configKey: entry.config_key,
        oldValue,
        newValue,
        changedBy: entry.changed_by,
        changedAt: entry.changed_at,
        ipAddress: entry.ip_address,
        userAgent: entry.user_agent
      };
    });

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

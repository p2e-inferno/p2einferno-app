/**
 * Subscription Configuration Audit Log API
 *
 * GET: Returns paginated audit logs for subscription config changes (admin-only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin:config:subscription:audit');

/**
 * GET - Fetch audit logs for subscription configuration
 * Query params: ?limit=20&offset=0
 */
export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard;

    // Parse pagination params
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100); // Max 100
    const offset = parseInt(searchParams.get('offset') || '0');

    if (limit < 1 || offset < 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Count total subscription-related audit logs
    const { count, error: countError } = await supabase
      .from('config_audit_log')
      .select('*', { count: 'exact', head: true })
      .ilike('config_key', 'subscription%');

    if (countError) {
      log.error('Failed to count audit logs', { error: countError });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit logs' },
        { status: 500 }
      );
    }

    // Fetch audit logs with pagination
    const { data: logs, error: logsError } = await supabase
      .from('config_audit_log')
      .select('*')
      .ilike('config_key', 'subscription%')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (logsError) {
      log.error('Failed to fetch audit logs', { error: logsError });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch audit logs' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      auditLogs: logs || [],
      total: count || 0,
      limit,
      offset,
    });
  } catch (error) {
    log.error('Subscription audit GET failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Recent Renewal Attempts API
 *
 * GET: Returns recent subscription renewal attempts (admin-only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin:config:subscription:recent-attempts');

/**
 * GET - Fetch recent renewal attempts
 * Query params: ?limit=10&status=all (all|success|failed)
 */
export async function GET(req: NextRequest) {
  try {
    const guard = await ensureAdminOrRespond(req);
    if (guard) return guard;

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 50); // Max 50
    const status = searchParams.get('status') || 'all';

    if (limit < 1) {
      return NextResponse.json(
        { success: false, error: 'Invalid limit parameter' },
        { status: 400 }
      );
    }

    if (!['all', 'success', 'failed'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Invalid status parameter' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Build query
    let query = supabase
      .from('subscription_renewal_attempts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    // Filter by status if specified
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: attempts, error } = await query;

    if (error) {
      log.error('Failed to fetch renewal attempts', { error });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch renewal attempts' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      attempts: attempts || [],
      limit,
      status,
    });
  } catch (error) {
    log.error('Recent attempts GET failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

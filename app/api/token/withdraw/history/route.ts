/**
 * GET /api/token/withdraw/history
 *
 * Returns paginated withdrawal history for the authenticated user.
 * Users can only see their own withdrawals (enforced by RLS).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:token:withdraw:history');

export async function GET(req: NextRequest) {
  try {
    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    const supabase = createAdminClient();
    const { data, error, count } = await supabase
      .from('dg_token_withdrawals')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      log.error('Failed to fetch withdrawal history', { error, userId: user.id });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch history' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      withdrawals: data,
      total: count,
      limit,
      offset
    });
  } catch (error) {
    log.error('Withdrawal history request failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

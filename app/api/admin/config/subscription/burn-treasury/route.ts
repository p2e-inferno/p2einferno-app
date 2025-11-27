/**
 * Burn Subscription Treasury API
 *
 * POST: Burn accumulated XP from treasury (admin-only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin:config:subscription:burn-treasury');

/**
 * POST - Burn XP from subscription treasury
 * Requires admin authentication
 */
export async function POST(req: NextRequest) {
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
    const { xpAmountToBurn, reason } = await req.json();

    // Validate inputs
    if (typeof xpAmountToBurn !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid input: xpAmountToBurn must be a number' },
        { status: 400 }
      );
    }

    if (xpAmountToBurn <= 0) {
      return NextResponse.json(
        { success: false, error: 'Burn amount must be greater than 0' },
        { status: 400 }
      );
    }

    if (typeof reason !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid input: reason must be a string' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch current treasury balance
    const { data: treasuryData, error: fetchError } = await supabase
      .from('subscription_treasury')
      .select('total_xp')
      .single();

    if (fetchError) {
      log.error('Failed to fetch treasury balance', { error: fetchError });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch treasury balance' },
        { status: 500 }
      );
    }

    const currentBalance = treasuryData?.total_xp || 0;

    if (xpAmountToBurn > currentBalance) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient treasury balance. Available: ${currentBalance}, Requested: ${xpAmountToBurn}`,
        },
        { status: 400 }
      );
    }

    // Call RPC function to burn treasury
    const { error: burnError } = await supabase.rpc(
      'burn_subscription_treasury',
      {
        burn_amount_xp: xpAmountToBurn,
        burn_reason: reason || 'Manual admin burn',
        admin_user_id: user.id,
      }
    );

    if (burnError) {
      log.error('Failed to burn treasury', { error: burnError, xpAmountToBurn });
      return NextResponse.json(
        { success: false, error: 'Failed to burn treasury' },
        { status: 500 }
      );
    }

    const newBalance = currentBalance - xpAmountToBurn;

    log.info('Treasury burned', {
      xpAmountToBurn,
      reason,
      userId: user.id,
      newBalance,
    });

    return NextResponse.json({
      success: true,
      newTreasuryBalance: newBalance,
      message: 'Treasury burned successfully',
    });
  } catch (error) {
    log.error('Burn treasury POST failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

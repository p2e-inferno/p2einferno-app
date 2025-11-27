/**
 * Subscription Configuration API
 *
 * GET: Returns current subscription config (service fee %, treasury balance)
 * PUT: Updates subscription config (requires admin session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { ensureAdminOrRespond } from '@/lib/auth/route-handlers/admin-guard';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin:config:subscription');

/**
 * GET - Fetch current subscription configuration
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Fetch service fee percent config
    const { data: feeData, error: feeError } = await supabase
      .from('system_config')
      .select('value, updated_at, updated_by')
      .eq('key', 'subscription_xp_service_fee_percent')
      .single();

    // Fetch treasury balance
    const { data: treasuryData, error: treasuryError } = await supabase
      .from('subscription_treasury')
      .select('total_xp, updated_at')
      .single();

    // Set defaults if queries fail
    const xpServiceFeePercent = feeData ? parseFloat(feeData.value) : 1.0;
    const treasuryBalance = treasuryData ? treasuryData.total_xp : 0;
    const updatedAt = feeData?.updated_at || null;
    const updatedBy = feeData?.updated_by || null;

    if (feeError && feeError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      log.warn('Failed to fetch service fee config', { error: feeError });
    }

    if (treasuryError && treasuryError.code !== 'PGRST116') {
      log.warn('Failed to fetch treasury balance', { error: treasuryError });
    }

    return NextResponse.json({
      success: true,
      config: {
        xpServiceFeePercent,
        treasuryBalance,
        updatedAt,
        updatedBy,
      },
    });
  } catch (error) {
    log.error('Subscription config GET failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT - Update subscription configuration
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
    const { xpServiceFeePercent } = await req.json();

    // Validate input
    if (typeof xpServiceFeePercent !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid input: xpServiceFeePercent must be a number' },
        { status: 400 }
      );
    }

    if (xpServiceFeePercent < 0.5 || xpServiceFeePercent > 3.0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service fee must be between 0.5% and 3.0%',
        },
        { status: 400 }
      );
    }

    // Get IP and user agent for audit
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const supabase = createAdminClient();

    // Update service fee percent
    const { error: updateError } = await supabase
      .from('system_config')
      .update({
        value: xpServiceFeePercent.toString(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('key', 'subscription_xp_service_fee_percent');

    if (updateError) {
      log.error('Failed to update service fee percent', { error: updateError });
      return NextResponse.json(
        { success: false, error: 'Failed to update service fee' },
        { status: 500 }
      );
    }

    // Log to audit trail
    await supabase.from('config_audit_log').insert([
      {
        config_key: 'subscription_xp_service_fee_percent',
        new_value: xpServiceFeePercent.toString(),
        changed_by: user.id,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    ]);

    log.info('Subscription config updated', {
      xpServiceFeePercent,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      config: { xpServiceFeePercent },
      message: 'Service fee updated successfully',
    });
  } catch (error) {
    log.error('Subscription config PUT failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

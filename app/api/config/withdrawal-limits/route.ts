/**
 * Public Withdrawal Limits Configuration API
 *
 * GET: Returns current withdrawal limits (public, no auth required)
 * 
 * This is the public version of the withdrawal limits endpoint for client-side validation.
 * Admin updates are handled by /api/admin/config/withdrawal-limits
 */

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:config:withdrawal-limits');

/**
 * GET - Fetch current withdrawal limits
 * Public endpoint (no auth required) for client-side validation
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    // Fetch withdrawal limit config values
    const { data, error } = await supabase
      .from('system_config')
      .select('key, value, updated_at')
      .in('key', ['dg_withdrawal_min_amount', 'dg_withdrawal_max_daily_amount']);

    if (error) {
      log.error('Failed to fetch withdrawal limits', { error });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch limits' },
        { status: 500 }
      );
    }

    // Transform array to object with defaults
    const limits = {
      minAmount: 3000, // defaults from environment variables
      maxAmount: 100000,
      updatedAt: null as string | null,
    };

    // Apply values from database if they exist
    data?.forEach(row => {
      if (row.key === 'dg_withdrawal_min_amount') {
        limits.minAmount = parseInt(row.value);
        limits.updatedAt = row.updated_at;
      } else if (row.key === 'dg_withdrawal_max_daily_amount') {
        limits.maxAmount = parseInt(row.value);
        if (!limits.updatedAt || (row.updated_at && row.updated_at > limits.updatedAt)) {
          limits.updatedAt = row.updated_at;
        }
      }
    });

    // Fall back to environment variables if database values are not set
    if (!data || data.length === 0) {
      limits.minAmount = parseInt(process.env.NEXT_PUBLIC_DG_WITHDRAWAL_MIN_AMOUNT || '3000');
      limits.maxAmount = parseInt(process.env.NEXT_PUBLIC_DG_WITHDRAWAL_MAX_DAILY_AMOUNT || '100000');
    }

    return NextResponse.json({
      success: true,
      limits
    });
  } catch (error) {
    log.error('Public withdrawal limits GET failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
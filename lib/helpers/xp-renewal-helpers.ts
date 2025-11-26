/**
 * XP Renewal Helper Functions
 * Calculations and utilities for XP-based subscription renewals
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('lib:xp-renewal-helpers');

/**
 * Calculate renewal cost breakdown
 * @param baseCostDg - Base cost in DG units (from lock)
 * @param serviceFeePercent - Service fee percentage (e.g., 1.0 for 1%)
 * @returns Cost breakdown with base, fee, and total
 */
export function calculateXpRenewalCost(
  baseCostDg: number,
  serviceFeePercent: number
): {
  baseCost: number;
  fee: number;
  total: number;
} {
  // Validate inputs
  if (baseCostDg < 0 || serviceFeePercent < 0) {
    throw new Error('Cost values cannot be negative');
  }

  // Calculate fee (round to nearest integer)
  const fee = Math.round((baseCostDg * serviceFeePercent) / 100);

  return {
    baseCost: baseCostDg,
    fee,
    total: baseCostDg + fee,
  };
}

/**
 * Validate service fee percent is within bounds
 * @param percent - Service fee percentage
 * @returns true if valid, false otherwise
 */
export function validateServiceFeePercent(percent: number): boolean {
  const MIN_FEE = 0.5;
  const MAX_FEE = 3.0;

  if (percent < MIN_FEE || percent > MAX_FEE) {
    log.warn('Service fee percent out of bounds', {
      percent,
      min: MIN_FEE,
      max: MAX_FEE,
    });
    return false;
  }

  return true;
}

/**
 * Get current service fee percent from system_config
 * Falls back to 1% if not configured
 * @param supabase - Supabase client
 * @returns Service fee percentage
 */
export async function getServiceFeePercent(
  supabase: SupabaseClient
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'subscription_xp_service_fee_percent')
      .eq('is_active', true)
      .single();

    if (error) {
      log.warn('Failed to fetch service fee percent, using default', {
        error,
      });
      return 1.0; // Default 1%
    }

    const percent = parseFloat(data.config_value);

    // Validate percent
    if (!validateServiceFeePercent(percent)) {
      log.warn('Retrieved service fee is out of bounds, using default', {
        percent,
      });
      return 1.0;
    }

    return percent;
  } catch (error) {
    log.error('Error fetching service fee percent', { error });
    return 1.0; // Default 1%
  }
}

/**
 * Format cost breakdown for UI display
 * @param costs - Cost breakdown object
 * @returns Formatted string
 */
export function formatRenewalCostBreakdown(costs: {
  baseCost: number;
  fee: number;
  total: number;
}): string {
  return `Base: ${costs.baseCost} XP, Fee: ${costs.fee} XP, Total: ${costs.total} XP`;
}

/**
 * Calculate days remaining until expiration
 * @param expirationTimestamp - Unix timestamp (seconds)
 * @returns Number of days remaining (can be negative if expired)
 */
export function calculateDaysRemaining(expirationTimestamp: number): number {
  const now = Math.floor(Date.now() / 1000);
  const secondsRemaining = expirationTimestamp - now;
  return Math.floor(secondsRemaining / (24 * 60 * 60));
}

/**
 * Format expiration date to readable string
 * @param expirationTimestamp - Unix timestamp (seconds)
 * @returns Formatted date string
 */
export function formatExpirationDate(expirationTimestamp: number): string {
  const date = new Date(expirationTimestamp * 1000);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get expiration status for UI coloring
 * @param daysRemaining - Number of days until expiration
 * @returns Status: 'healthy' | 'warning' | 'urgent' | 'expired'
 */
export function getExpirationStatus(
  daysRemaining: number
): 'healthy' | 'warning' | 'urgent' | 'expired' {
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining < 7) return 'urgent';
  if (daysRemaining < 30) return 'warning';
  return 'healthy';
}

/**
 * Calculate new expiration timestamp after renewal
 * @param currentExpirationTimestamp - Current expiration (Unix seconds)
 * @param durationDays - Days to add
 * @returns New expiration timestamp (Unix seconds)
 */
export function calculateNewExpiration(
  currentExpirationTimestamp: number,
  durationDays: number
): number {
  const durationSeconds = durationDays * 24 * 60 * 60;
  return currentExpirationTimestamp + durationSeconds;
}

/**
 * Validate renewal parameters
 * @param userXpBalance - Current user XP balance
 * @param totalCostXp - Total XP cost (base + fee)
 * @param duration - Duration in days (30, 90, 365)
 * @returns { valid: boolean; error?: string }
 */
export function validateRenewalParams(
  userXpBalance: number,
  totalCostXp: number,
  duration: number
): { valid: boolean; error?: string } {
  if (userXpBalance < 0) {
    return { valid: false, error: 'Invalid user XP balance' };
  }

  if (totalCostXp < 0) {
    return { valid: false, error: 'Invalid renewal cost' };
  }

  if (userXpBalance < totalCostXp) {
    return { valid: false, error: 'Insufficient XP' };
  }

  if (![30, 90, 365].includes(duration)) {
    return { valid: false, error: 'Invalid duration' };
  }

  return { valid: true };
}

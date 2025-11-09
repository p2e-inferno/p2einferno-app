/**
 * GET /api/user/experience-points
 *
 * Returns the current user's XP balance from their profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPrivyUserFromNextRequest } from '@/lib/auth/privy';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:user:experience-points');

export async function GET(req: NextRequest) {
  try {
    const user = await getPrivyUserFromNextRequest(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Fetch user's XP from their profile
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('experience_points')
      .eq('privy_user_id', user.id)
      .single();

    if (error) {
      log.error('Failed to fetch user XP', { error, userId: user.id });
      return NextResponse.json(
        { success: false, error: 'Failed to fetch experience points' },
        { status: 500 }
      );
    }

    if (!profile) {
      log.warn('User profile not found', { userId: user.id });
      return NextResponse.json(
        { success: false, error: 'User profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      xp: profile.experience_points || 0
    });
  } catch (error) {
    log.error('Experience points request failed', { error });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

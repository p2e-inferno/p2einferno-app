import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/admin-session';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:admin-session:verify');

/**
 * Lightweight admin session verification endpoint
 * Used by frontend to check if current session is valid
 * Returns 200 if valid session exists, 401 if expired/missing
 */
export async function GET(req: NextRequest) {
  try {
    // Check for admin-session cookie
    const cookieToken = req.cookies.get('admin-session')?.value;

    if (!cookieToken) {
      log.debug('No admin session cookie found');
      return NextResponse.json({ valid: false, reason: 'No session cookie' }, { status: 401 });
    }

    try {
      // Verify the session token
      const claims = await verifyAdminSession(cookieToken);

      if (!claims) {
        log.debug('Session verification failed - invalid claims');
        return NextResponse.json({ valid: false, reason: 'Invalid session' }, { status: 401 });
      }

      log.debug('Session verification successful', {
        did: claims.sub || claims.did,
        exp: claims.exp
      });

      return NextResponse.json({
        valid: true,
        did: claims.sub || claims.did,
        expiresAt: claims.exp
      }, { status: 200 });

    } catch (verifyError: any) {
      log.debug('Session verification failed', { error: verifyError.message });
      return NextResponse.json({
        valid: false,
        reason: 'Session verification failed',
        error: verifyError.message
      }, { status: 401 });
    }

  } catch (error: any) {
    log.error('Session verification endpoint error', { error });
    return NextResponse.json({
      valid: false,
      reason: 'Server error'
    }, { status: 500 });
  }
}
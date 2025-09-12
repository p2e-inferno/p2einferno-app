import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession, getAdminTokenWithSource } from '@/lib/auth/admin-session';
import { getLogger } from '@/lib/utils/logger';

// Middleware is disabled by default to avoid breaking pages/api admin routes.
// Enable by setting ADMIN_SESSION_ENABLED=true to enforce session on /api/admin/* (excluding /api/admin/session).

const log = getLogger('middleware:admin');

export async function middleware(req: NextRequest) {
  const enabled = process.env.ADMIN_SESSION_ENABLED === 'true';
  if (!enabled) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isV1 = pathname.startsWith('/api/admin');
  const isV2 = pathname.startsWith('/api/v2/admin');
  if (!isV1 && !isV2) return NextResponse.next();
  if (pathname.startsWith('/api/admin/session') || pathname.startsWith('/api/v2/admin/session')) return NextResponse.next();

  log.info('Checking admin session', { path: pathname });
  const rawCookie = req.headers.get('cookie') || '';
  const hasPrivyTokenCookie = /(^|;\s*)privy-token=/.test(rawCookie);
  const hasAdminSessionCookie = /(^|;\s*)admin-session=/.test(rawCookie);
  const hasAuthorization = !!req.headers.get('authorization');
  log.debug('Incoming auth hints', { hasPrivyTokenCookie, hasAdminSessionCookie, hasAuthorization });

  const { token, source } = getAdminTokenWithSource(req as unknown as Request);
  log.debug('Token selection', { source, hasToken: !!token });
  
  if (!token) {
    log.warn('No admin session token', { path: pathname });
    return NextResponse.json({ error: 'Admin session required' }, { status: 401 });
  }
  try {
    const claims = await verifyAdminSession(token);
    log.info('Admin session verified', { path: pathname, did: claims?.sub || claims?.did });
    return NextResponse.next();
  } catch (error: any) {
    log.warn('Admin session verification failed', { path: pathname, source, error: error?.message || String(error) });
    return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
  }
}

export const config = {
  matcher: ['/api/:path*'],
};

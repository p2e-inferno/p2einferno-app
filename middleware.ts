import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/auth/admin-session';
import { getLogger } from '@/lib/utils/logger';

function getCookieFromHeader(cookieHeader: string, name: string) {
  const cookies = cookieHeader.split(/;\s*/);
  for (const c of cookies) {
    const [k, v] = c.split('=');
    if (k === name) return decodeURIComponent(v || '');
  }
  return null;
}

// Middleware is disabled by default to avoid breaking pages/api admin routes.
// Enable by setting ADMIN_SESSION_ENABLED=true to enforce session on /api/admin/* (excluding /api/admin/session).

const log = getLogger('middleware:admin');

export async function middleware(req: NextRequest) {
  const enabled = process.env.ADMIN_SESSION_ENABLED === 'true';
  if (!enabled) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isAdminApi = pathname.startsWith('/api/admin');
  if (!isAdminApi) return NextResponse.next();
  if (pathname.startsWith('/api/admin/session')) return NextResponse.next();

  log.info('Checking admin session', { path: pathname });
  const rawCookie = req.headers.get('cookie') || '';
  const hasPrivyTokenCookie = /(^|;\s*)privy-token=/.test(rawCookie);
  const hasAdminSessionCookie = /(^|;\s*)admin-session=/.test(rawCookie);
  const hasAuthorization = !!req.headers.get('authorization');
  log.debug('Incoming auth hints', { hasPrivyTokenCookie, hasAdminSessionCookie, hasAuthorization });

  // Only accept admin-session cookies, not Authorization headers
  // Authorization headers should only be used by /api/admin/session to mint new sessions
  const cookieToken = getCookieFromHeader(req.headers.get('cookie') || '', 'admin-session');
  log.debug('Token selection', { source: cookieToken ? 'cookie' : 'none', hasToken: !!cookieToken });

  if (!cookieToken) {
    log.warn('No admin session cookie', { path: pathname });
    return NextResponse.json({ error: 'Admin session required' }, { status: 401 });
  }
  try {
    const claims = await verifyAdminSession(cookieToken);
    log.info('Admin session verified', { path: pathname, did: claims?.sub || claims?.did });
    return NextResponse.next();
  } catch (error: any) {
    log.warn('Admin session verification failed', { path: pathname, source: 'cookie', error: error?.message || String(error) });
    return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
  }
}

export const config = {
  matcher: ['/api/:path*'],
};

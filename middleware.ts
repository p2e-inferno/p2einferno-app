import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession, getAdminTokenFromRequest } from '@/lib/auth/admin-session';

// Middleware is disabled by default to avoid breaking existing pages/api admin routes.
// Enable by setting ADMIN_SESSION_ENABLED=true to enforce session on /api/admin/* (excluding /api/admin/session).

export async function middleware(req: NextRequest) {
  const enabled = process.env.ADMIN_SESSION_ENABLED === 'true';
  if (!enabled) return NextResponse.next();

  const { pathname } = req.nextUrl;
  const isV1 = pathname.startsWith('/api/admin');
  const isV2 = pathname.startsWith('/api/v2/admin');
  if (!isV1 && !isV2) return NextResponse.next();
  if (pathname.startsWith('/api/admin/session') || pathname.startsWith('/api/v2/admin/session')) return NextResponse.next();

  // Reuse shared extractor to avoid duplication and keep behavior consistent
  const token = getAdminTokenFromRequest(req as unknown as Request);
  if (!token) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 401 });
  }
  try {
    await verifyAdminSession(token);
    return NextResponse.next();
  } catch {
    return NextResponse.json({ error: 'Invalid or expired admin session' }, { status: 401 });
  }
}

export const config = {
  matcher: ['/api/:path*'],
};

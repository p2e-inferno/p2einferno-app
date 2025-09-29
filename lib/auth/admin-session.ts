import { SignJWT, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import type { NextApiRequest } from 'next';
import { ADMIN_SESSION_TTL_SECONDS } from '@/lib/app-config/admin';

const DEFAULT_COOKIE_NAME = 'admin-session';

function getSecret(): Uint8Array {
  const secret = process.env.ADMIN_SESSION_JWT_SECRET || process.env.NEXT_PRIVY_APP_SECRET || 'dev-insecure-secret';
  return new TextEncoder().encode(secret);
}

export interface AdminSessionClaims {
  did: string;
  wallet?: string;
  roles: string[]; // must include 'admin'
  locks?: string[];
}

export async function issueAdminSession(claims: AdminSessionClaims, ttlSeconds = ADMIN_SESSION_TTL_SECONDS) {
  const secret = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;

  const token = await new SignJWT({ ...claims, admin: true })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setSubject(claims.did)
    .setIssuer('p2einferno')
    .setAudience('admin')
    .sign(secret);
  return { token, exp };
}

export async function verifyAdminSession(token: string) {
  const secret = getSecret();
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'p2einferno',
    audience: 'admin',
    algorithms: ['HS256'], // Explicitly specify HS256 algorithm
  });
  return payload as any;
}

export function setAdminCookie(res: NextResponse, token: string, exp: number, cookieName = DEFAULT_COOKIE_NAME) {
  const maxAge = exp - Math.floor(Date.now() / 1000);
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearAdminCookie(res: NextResponse, cookieName = DEFAULT_COOKIE_NAME) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(cookieName, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}

export function getAdminTokenFromRequest(req: Request, cookieName = DEFAULT_COOKIE_NAME) {
  // Prefer cookie over Authorization header to avoid confusing Privy access tokens
  const cookieToken = getCookieFromHeader(req.headers.get('cookie') || '', cookieName);
  const headerToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  return cookieToken || headerToken || null;
}

/**
 * Like getAdminTokenFromRequest, but also returns which source was used.
 */
export function getAdminTokenWithSource(req: Request, cookieName = DEFAULT_COOKIE_NAME): { token: string | null; source: 'cookie' | 'authorization' | 'none' } {
  const cookieToken = getCookieFromHeader(req.headers.get('cookie') || '', cookieName) || '';
  const headerToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (cookieToken) return { token: cookieToken, source: 'cookie' };
  if (headerToken) return { token: headerToken, source: 'authorization' };
  return { token: null, source: 'none' };
}

function getCookieFromHeader(cookieHeader: string, name: string) {
  const cookies = cookieHeader.split(/;\s*/);
  for (const c of cookies) {
    const [k, v] = c.split('=');
    if (k === name) return decodeURIComponent(v || '');
  }
  return null;
}

/**
 * Helper for NextApiRequest (Pages API) to extract admin-session token
 */
export function getAdminTokenFromNextApiRequest(req: NextApiRequest, cookieName = DEFAULT_COOKIE_NAME) {
  const headerToken = req.headers.authorization?.replace(/^Bearer\s+/i, '') || '';
  // Prefer cookie (JWT admin session) over Privy Authorization
  const cookieToken = (req.cookies && typeof req.cookies === 'object')
    ? (req.cookies as Record<string, any>)[cookieName]
    : getCookieFromHeader(req.headers.cookie || '', cookieName);
  return (cookieToken as string) || headerToken || null;
}

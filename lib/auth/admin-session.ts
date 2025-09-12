import { SignJWT, jwtVerify } from 'jose';
import { NextResponse } from 'next/server';
import { ADMIN_SESSION_TTL_SECONDS } from '@/lib/config/admin';

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
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || getCookieFromHeader(req.headers.get('cookie') || '', cookieName);
  return token || null;
}

function getCookieFromHeader(cookieHeader: string, name: string) {
  const cookies = cookieHeader.split(/;\s*/);
  for (const c of cookies) {
    const [k, v] = c.split('=');
    if (k === name) return decodeURIComponent(v || '');
  }
  return null;
}

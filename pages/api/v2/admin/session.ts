import type { NextApiRequest, NextApiResponse } from 'next';
import { issueAdminSession } from '@/lib/auth/admin-session';
import { getPrivyUser } from '@/lib/auth/privy';
import { checkMultipleWalletsForAdminKey, checkDevelopmentAdminAddress } from '@/lib/auth/admin-key-checker';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('api:v2:admin-session');

const RL_LIMIT = parseInt(process.env.ADMIN_SESSION_RATE_LIMIT_PER_MINUTE || '30', 10);
const RL_BUCKET_MS = 60_000;
type Bucket = { count: number; resetAt: number };
const rateMap = new Map<string, Bucket>();

function checkRateLimit(key: string) {
  const now = Date.now();
  const b = rateMap.get(key);
  if (!b || b.resetAt <= now) {
    rateMap.set(key, { count: 1, resetAt: now + RL_BUCKET_MS });
    return { allowed: true, remaining: RL_LIMIT - 1, resetAt: now + RL_BUCKET_MS };
  }
  if (b.count >= RL_LIMIT) return { allowed: false, remaining: 0, resetAt: b.resetAt };
  b.count += 1;
  return { allowed: true, remaining: RL_LIMIT - b.count, resetAt: b.resetAt };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // Construct mock request for getPrivyUser which expects headers/cookies like Next API
    const mockReq: any = { headers: req.headers, cookies: req.cookies };
    const user = await getPrivyUser(mockReq, true);
    if (!user) return res.status(401).json({ error: 'Authentication required' });

    const ip = (req.headers['x-forwarded-for'] as string) || (req.headers['x-real-ip'] as string) || req.socket.remoteAddress || 'unknown';
    const rlKey = user.id ? `did:${user.id}` : `ip:${ip}`;
    const rl = checkRateLimit(rlKey);
    if (!rl.allowed) return res.status(429).setHeader('Retry-After', String(Math.ceil((rl.resetAt - Date.now())/1000))).json({ error: 'Too Many Requests' });

    const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
    if (!adminLockAddress && process.env.NODE_ENV !== 'development') {
      return res.status(500).json({ error: 'Admin lock not configured' });
    }

    const walletAddresses: string[] = user.walletAddresses || [];
    if ((!walletAddresses || walletAddresses.length === 0) && process.env.NODE_ENV === 'development') {
      const dev = (process.env.DEV_ADMIN_ADDRESSES || '').split(',')[0]?.trim();
      if (dev && adminLockAddress) {
        const ok = await checkDevelopmentAdminAddress(dev, adminLockAddress);
        if (ok.isValid) {
          const { token, exp } = await issueAdminSession({ did: user.id, wallet: dev, roles: ['admin'], locks: [adminLockAddress] });
          res.setHeader('Set-Cookie', `admin-session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
          return res.status(200).json({ ok: true, exp });
        }
      }
      return res.status(403).json({ error: 'No wallet addresses found' });
    }

    if (!walletAddresses || walletAddresses.length === 0) return res.status(403).json({ error: 'No wallet addresses found' });

    const doKeyCheck = async () => {
      if (!adminLockAddress) return { hasValidKey: true } as any;
      return await checkMultipleWalletsForAdminKey(walletAddresses, adminLockAddress);
    };
    const keyRes = await doKeyCheck();
    if (!keyRes?.hasValidKey) return res.status(403).json({ error: 'Admin access required' });

    const primaryWallet = walletAddresses[0];
    const { token, exp } = await issueAdminSession({ did: user.id, wallet: primaryWallet, roles: ['admin'], locks: adminLockAddress ? [adminLockAddress] : [] });
    res.setHeader('Set-Cookie', `admin-session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax`);
    return res.status(200).json({ ok: true, exp });
  } catch (error: any) {
    log.error('admin session error', { error });
    return res.status(500).json({ error: 'Server error' });
  }
}


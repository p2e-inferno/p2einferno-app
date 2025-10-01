import { NextRequest, NextResponse } from 'next/server';
import { issueAdminSession, setAdminCookie } from '@/lib/auth/admin-session';
import { getPrivyUserFromNextRequest, getUserWalletAddresses } from '@/lib/auth/privy';
import { checkMultipleWalletsForAdminKey, checkDevelopmentAdminAddress } from '@/lib/auth/admin-key-checker';
import { getLogger } from '@/lib/utils/logger';
import { ADMIN_SESSION_TTL_SECONDS, ADMIN_RPC_TIMEOUT_MS } from '@/lib/app-config/admin';
import { createAlchemyEthersAdapterReadClient } from "@/lib/blockchain/config";

const log = getLogger('api:admin-session');

// Simple in-memory rate limiter per DID or IP; configurable via env
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
  if (b.count >= RL_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: b.resetAt };
  }
  b.count += 1;
  return { allowed: true, remaining: RL_LIMIT - b.count, resetAt: b.resetAt };
}

export async function POST(req: NextRequest) {
  try {
    // Get user with wallets via shared NextRequest adapter
    const user = await getPrivyUserFromNextRequest(req, false);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Rate limit per DID or forwarded IP
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const rlKey = user.id ? `did:${user.id}` : `ip:${ip}`;
    const rl = checkRateLimit(rlKey);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429, headers: { 'Retry-After': Math.ceil((rl.resetAt - Date.now())/1000).toString() } });
    }

    const adminLockAddress = process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS;
    if (!adminLockAddress) {
      if (process.env.NODE_ENV === 'development') {
        log.warn('Admin lock not set; allowing admin session in dev');
      } else {
        return NextResponse.json({ error: 'Admin lock not configured' }, { status: 500 });
      }
    }

    // Determine wallets to check using shared utility
    const walletAddresses: string[] = await getUserWalletAddresses(user.id);
    if ((!walletAddresses || walletAddresses.length === 0) && process.env.NODE_ENV === 'development') {
      const devAdminAddresses = process.env.DEV_ADMIN_ADDRESSES;
      if (devAdminAddresses) {
        const devAddress = devAdminAddresses.split(',')[0]?.trim();
        if (devAddress && adminLockAddress) {
          const client = createAlchemyEthersAdapterReadClient();
          const res = await checkDevelopmentAdminAddress(devAddress, adminLockAddress, client);
          if (res.isValid) {
            const { token, exp } = await issueAdminSession({ did: user.id, wallet: devAddress, roles: ['admin'], locks: [adminLockAddress] }, ADMIN_SESSION_TTL_SECONDS);
            const response = NextResponse.json({ ok: true, exp }, { status: 200 });
            setAdminCookie(response, token, exp);
            return response;
          }
        }
      }
    }

    if (!walletAddresses || walletAddresses.length === 0) {
      return NextResponse.json({ error: 'No wallet addresses found' }, { status: 403 });
    }

    // Key check with timeout race to avoid hanging
    const doKeyCheck = async () => {
      const client = createAlchemyEthersAdapterReadClient();
      if (!adminLockAddress) return { hasValidKey: true }; // dev path
      return await checkMultipleWalletsForAdminKey(walletAddresses, adminLockAddress, client);
    };
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('keycheck-timeout')), ADMIN_RPC_TIMEOUT_MS));
    let keyRes: any;
    try {
      keyRes = await Promise.race([doKeyCheck(), timeout]);
    } catch (e: any) {
      log.error('Key check error/timeout', { err: e?.message });
      return NextResponse.json({ error: 'Admin key verification failed' }, { status: 503 });
    }

    if (!keyRes?.hasValidKey) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const primaryWallet = walletAddresses[0];
    const { token, exp } = await issueAdminSession({ did: user.id, wallet: primaryWallet, roles: ['admin'], locks: adminLockAddress ? [adminLockAddress] : [] }, ADMIN_SESSION_TTL_SECONDS);

    const response = NextResponse.json({ ok: true, exp }, { status: 200 });
    setAdminCookie(response, token, exp);
    return response;
  } catch (error: any) {
    log.error('Admin session issuance error', { error });
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

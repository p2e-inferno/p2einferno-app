import { NextRequest, NextResponse } from 'next/server';
import { clearAdminCookie } from '@/lib/auth/admin-session';

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ ok: true }, { status: 200 });
  clearAdminCookie(res);
  return res;
}


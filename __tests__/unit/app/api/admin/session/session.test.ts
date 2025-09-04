import * as privy from '@/lib/auth/privy';
import * as keychecker from '@/lib/auth/admin-key-checker';

// Mock next/server before importing the route handler
jest.mock('next/server', () => {
  return {
    NextResponse: class {
      static json(body: any, init: any = {}) {
        const headers = new Map<string, string>();
        const res: any = {
          status: init.status || 200,
          headers,
          cookies: {
            set(name: string, value: string, opts: any) {
              const cookie = `${name}=${encodeURIComponent(value)}; Path=${opts?.path || '/'}; HttpOnly; SameSite=Lax`;
              headers.set('set-cookie', cookie);
            }
          },
          json: async () => body,
        };
        return res;
      }
    }
  };
});

const { POST } = require('@/app/api/admin/session/route');

jest.mock('@/lib/auth/privy');
jest.mock('@/lib/auth/admin-key-checker');

function makeRequest(headers: Record<string,string> = {}, cookies: Record<string,string> = {}) {
  // Minimal mock request: only properties used by handler
  const req: any = {
    url: 'http://localhost/api/admin/session',
    headers: { get: (k: string) => headers[k.toLowerCase()] || headers[k] || null },
    cookies: { getAll: () => Object.entries(cookies).map(([name, value]) => ({ name, value })) },
  };
  return req;
}

describe('admin session route', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NEXT_PUBLIC_ADMIN_LOCK_ADDRESS = '0xTestLock';
    (privy.getPrivyUser as any).mockResolvedValue({ id: 'did:privy:xyz', walletAddresses: ['0xabc'] });
    (keychecker.checkMultipleWalletsForAdminKey as any).mockResolvedValue({ hasValidKey: true });
  });

  test('issues admin session cookie on success', async () => {
    const req = makeRequest({ authorization: 'Bearer privy-token' });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
  });

  test('returns 401 if not authenticated', async () => {
    (privy.getPrivyUser as any).mockResolvedValue(null);
    const req = makeRequest();
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });
});

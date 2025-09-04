import * as nextCache from 'next/cache';

jest.mock('next/server', () => ({
  NextResponse: class { static json(body:any, init:any={}) { return { status: init.status||200, json: async()=>body, headers: new Map(), cookies: { set(){} } }; } }
}));

jest.mock('next/cache', () => ({
  revalidateTag: jest.fn(),
}));

describe('task-submissions route invalidation', () => {
  test('exports mutation handlers', async () => {
    const mod = await import('@/app/api/admin/task-submissions/route');
    expect(typeof mod.POST).toBe('function');
    expect(typeof mod.PUT).toBe('function');
  });
});

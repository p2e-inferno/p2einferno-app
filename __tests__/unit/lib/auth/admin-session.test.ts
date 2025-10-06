import {
  issueAdminSession,
  verifyAdminSession,
} from "@/lib/auth/admin-session";

describe("admin-session", () => {
  test("issues and verifies a token with correct claims (mocked jose)", async () => {
    const { token, exp } = await issueAdminSession(
      {
        did: "did:privy:abc",
        wallet: "0xabc",
        roles: ["admin"],
        locks: ["0xlock"],
      },
      10,
    );
    expect(typeof token).toBe("string");
    expect(exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    const payload: any = await verifyAdminSession(token);
    // jose is mocked in jest.setup.ts to return a fixed payload
    expect(payload.sub).toBe("did:privy:test");
    expect(payload.roles).toContain("admin");
  });
});

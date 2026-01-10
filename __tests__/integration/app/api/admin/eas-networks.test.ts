import { NextResponse } from "next/server";
import { GET, POST } from "@/app/api/admin/eas-networks/route";
import { PATCH, DELETE } from "@/app/api/admin/eas-networks/[name]/route";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import {
  getAllNetworks,
  invalidateNetworkConfigCache,
} from "@/lib/attestation/core/network-config";
import { createAdminClient } from "@/lib/supabase/server";

jest.mock("@/lib/auth/route-handlers/admin-guard", () => ({
  ensureAdminOrRespond: jest.fn(),
}));

jest.mock("@/lib/attestation/core/network-config", () => ({
  getAllNetworks: jest.fn(),
  invalidateNetworkConfigCache: jest.fn(),
}));

jest.mock("@/lib/supabase/server", () => ({
  createAdminClient: jest.fn(),
}));

const mockEnsureAdminOrRespond = ensureAdminOrRespond as jest.Mock;
const mockGetAllNetworks = getAllNetworks as jest.Mock;
const mockInvalidateCache = invalidateNetworkConfigCache as jest.Mock;
const mockCreateAdminClient = createAdminClient as jest.Mock;

const makeSupabase = (overrides?: {
  insert?: jest.Mock;
  update?: jest.Mock;
  del?: jest.Mock;
}) => {
  const insert =
    overrides?.insert || jest.fn().mockResolvedValue({ error: null });
  const update =
    overrides?.update ||
    jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
  const del =
    overrides?.del ||
    jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    });
  return {
    from: jest.fn(() => ({
      insert,
      update,
      delete: del,
    })),
  };
};

describe("admin eas-networks routes", () => {
  beforeAll(() => {
    if (typeof Response !== "undefined" && !(Response as any).json) {
      (Response as any).json = (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
          },
        });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAdminOrRespond.mockResolvedValue(null);
  });

  it("GET returns enabled networks", async () => {
    mockGetAllNetworks.mockResolvedValue([
      {
        name: "base",
        displayName: "Base Mainnet",
        isTestnet: false,
        chainId: 8453,
        easScanBaseUrl: "https://base.easscan.org",
        explorerBaseUrl: "https://base.blockscout.com",
        enabled: true,
        easContractAddress: "0x4200000000000000000000000000000000000021",
        schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
        eip712ProxyAddress: null,
        rpcUrl: null,
        source: "seed",
        sourceCommit: null,
      },
    ]);

    const req = new Request("http://localhost/api/admin/eas-networks") as any;
    const res = await GET(req);
    expect(res).toBeInstanceOf(NextResponse);
    const json = await res.json();
    expect(json.networks).toHaveLength(1);
    expect(mockGetAllNetworks).toHaveBeenCalledWith({
      includeDisabled: false,
      bypassCache: true,
    });
  });

  it("POST inserts a network and invalidates cache", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request("http://localhost/api/admin/eas-networks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "base",
        chainId: 8453,
        displayName: "Base Mainnet",
        isTestnet: false,
        enabled: true,
        easContractAddress: "0x4200000000000000000000000000000000000021",
        schemaRegistryAddress: "0x4200000000000000000000000000000000000020",
      }),
    }) as any;

    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockInvalidateCache).toHaveBeenCalled();
  });

  it("PATCH updates a network and invalidates cache", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request("http://localhost/api/admin/eas-networks/base", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: true,
      }),
    }) as any;

    const res = await PATCH(req, { params: { name: "base" } } as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockInvalidateCache).toHaveBeenCalled();
  });

  it("PATCH rejects invalid contract addresses", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request("http://localhost/api/admin/eas-networks/base", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        easContractAddress: "0x123",
      }),
    }) as any;

    const res = await PATCH(req, { params: { name: "base" } } as any);
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.error).toMatch(/invalid eas address/i);
  });

  it("DELETE removes a network and invalidates cache", async () => {
    const supabase = makeSupabase();
    mockCreateAdminClient.mockReturnValue(supabase);

    const req = new Request("http://localhost/api/admin/eas-networks/base", {
      method: "DELETE",
    }) as any;

    const res = await DELETE(req, { params: { name: "base" } } as any);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockInvalidateCache).toHaveBeenCalled();
  });
});

import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import {
  getAllNetworks,
  invalidateNetworkConfigCache,
} from "@/lib/attestation/core/network-config";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("api:admin:eas-networks");

const isValidAddress = (value: string): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(value);

type CreateNetworkBody = {
  name: string;
  chainId: number;
  displayName: string;
  isTestnet: boolean;
  enabled: boolean;
  easContractAddress: string;
  schemaRegistryAddress: string;
  eip712ProxyAddress?: string | null;
  easScanBaseUrl?: string | null;
  explorerBaseUrl?: string | null;
  rpcUrl?: string | null;
  source?: string | null;
};

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const includeDisabled = url.searchParams.get("includeDisabled") === "1";

  const networks = await getAllNetworks({
    includeDisabled,
    bypassCache: true,
  });

  return NextResponse.json(
    {
      networks: networks.map((network) => ({
        name: network.name,
        displayName: network.displayName,
        isTestnet: network.isTestnet,
        easScanBaseUrl: network.easScanBaseUrl,
        explorerBaseUrl: network.explorerBaseUrl,
        chainId: network.chainId,
        ...(includeDisabled
          ? {
              enabled: network.enabled,
              easContractAddress: network.easContractAddress,
              schemaRegistryAddress: network.schemaRegistryAddress,
              eip712ProxyAddress: network.eip712ProxyAddress,
              rpcUrl: network.rpcUrl,
              source: network.source,
              sourceCommit: network.sourceCommit,
            }
          : {}),
      })),
    },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const body = (await req.json()) as CreateNetworkBody;
  const {
    name,
    chainId,
    displayName,
    isTestnet,
    enabled,
    easContractAddress,
    schemaRegistryAddress,
    eip712ProxyAddress = null,
    easScanBaseUrl = null,
    explorerBaseUrl = null,
    rpcUrl = null,
    source = "manual",
  } = body || ({} as any);

  if (!name || !chainId || !displayName) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  if (!/^[a-z0-9-]{2,64}$/.test(name)) {
    return NextResponse.json(
      { error: "Invalid network name" },
      { status: 400 },
    );
  }

  if (
    !isValidAddress(easContractAddress) ||
    !isValidAddress(schemaRegistryAddress)
  ) {
    return NextResponse.json(
      { error: "Invalid contract address" },
      { status: 400 },
    );
  }

  if (eip712ProxyAddress && !isValidAddress(eip712ProxyAddress)) {
    return NextResponse.json(
      { error: "Invalid EIP712 proxy address" },
      { status: 400 },
    );
  }

  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from("eas_networks").insert({
      name,
      chain_id: chainId,
      display_name: displayName,
      is_testnet: Boolean(isTestnet),
      enabled: Boolean(enabled),
      eas_contract_address: easContractAddress,
      schema_registry_address: schemaRegistryAddress,
      eip712_proxy_address: eip712ProxyAddress,
      eas_scan_base_url: easScanBaseUrl,
      explorer_base_url: explorerBaseUrl,
      rpc_url: rpcUrl,
      source,
    });

    if (error) {
      log.error("Failed to create eas_network", { error });
      return NextResponse.json(
        { error: "Failed to create network" },
        { status: 500 },
      );
    }

    invalidateNetworkConfigCache();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    log.error("Failed to create eas_network", { err: err?.message });
    return NextResponse.json(
      { error: "Failed to create network" },
      { status: 500 },
    );
  }
}

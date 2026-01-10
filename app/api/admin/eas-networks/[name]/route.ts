import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { invalidateNetworkConfigCache } from "@/lib/attestation/core/network-config";

const log = getLogger("api:admin:eas-networks:[name]");

const isValidAddress = (value: string): boolean =>
  /^0x[a-fA-F0-9]{40}$/.test(value);

type UpdateNetworkBody = {
  displayName?: string;
  isTestnet?: boolean;
  enabled?: boolean;
  easContractAddress?: string;
  schemaRegistryAddress?: string;
  eip712ProxyAddress?: string | null;
  easScanBaseUrl?: string | null;
  explorerBaseUrl?: string | null;
  rpcUrl?: string | null;
};

export async function PATCH(
  req: NextRequest,
  context: { params: { name: string } },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { name } = await context.params;

  const body = (await req.json()) as UpdateNetworkBody;
  const {
    displayName,
    isTestnet,
    enabled,
    easContractAddress,
    schemaRegistryAddress,
    eip712ProxyAddress,
    easScanBaseUrl,
    explorerBaseUrl,
    rpcUrl,
  } = body || ({} as any);

  if (easContractAddress && !isValidAddress(easContractAddress)) {
    return NextResponse.json({ error: "Invalid EAS address" }, { status: 400 });
  }
  if (schemaRegistryAddress && !isValidAddress(schemaRegistryAddress)) {
    return NextResponse.json(
      { error: "Invalid SchemaRegistry address" },
      { status: 400 },
    );
  }
  if (eip712ProxyAddress && !isValidAddress(eip712ProxyAddress)) {
    return NextResponse.json(
      { error: "Invalid EIP712 proxy address" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const update: Record<string, any> = {};
  if (displayName !== undefined) update.display_name = displayName;
  if (isTestnet !== undefined) update.is_testnet = Boolean(isTestnet);
  if (enabled !== undefined) update.enabled = Boolean(enabled);
  if (easContractAddress !== undefined)
    update.eas_contract_address = easContractAddress;
  if (schemaRegistryAddress !== undefined)
    update.schema_registry_address = schemaRegistryAddress;
  if (eip712ProxyAddress !== undefined)
    update.eip712_proxy_address = eip712ProxyAddress;
  if (easScanBaseUrl !== undefined) update.eas_scan_base_url = easScanBaseUrl;
  if (explorerBaseUrl !== undefined) update.explorer_base_url = explorerBaseUrl;
  if (rpcUrl !== undefined) update.rpc_url = rpcUrl;

  const { error } = await supabase
    .from("eas_networks")
    .update(update)
    .eq("name", name);
  if (error) {
    log.error("Failed to update eas_network", { error });
    return NextResponse.json(
      { error: "Failed to update network" },
      { status: 500 },
    );
  }

  invalidateNetworkConfigCache();
  return NextResponse.json({ success: true }, { status: 200 });
}

export async function DELETE(
  req: NextRequest,
  context: { params: { name: string } },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { name } = await context.params;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("eas_networks")
    .delete()
    .eq("name", name);
  if (error) {
    log.error("Failed to delete eas_network", { error });
    return NextResponse.json(
      { error: "Failed to delete network" },
      { status: 500 },
    );
  }

  invalidateNetworkConfigCache();
  return NextResponse.json({ success: true }, { status: 200 });
}

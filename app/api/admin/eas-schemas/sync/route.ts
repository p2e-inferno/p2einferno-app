import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getNetworkConfig } from "@/lib/attestation/core/network-config";
import {
  createPublicClientForNetwork,
  isServerBlockchainConfigured,
  CHAIN_ID as APP_CHAIN_ID,
} from "@/lib/blockchain/config";
import { verifySchemaOnChain } from "@/lib/blockchain/services/schema-deployment-service";
import { verifyAdminSignedAction } from "@/lib/auth/admin-signed-actions";
import { keccak256, stringToHex } from "viem";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";
import { ensureActiveSchemaKey } from "@/lib/attestation/schemas/schema-key-db";

const log = getLogger("api:admin:eas-schemas:sync");

const getActiveWallet = (req: NextRequest): `0x${string}` | null => {
  const header = req.headers.get("x-active-wallet");
  if (!header) return null;
  return header.toLowerCase() as `0x${string}`;
};

type SyncRequestBody = {
  schemaUid: `0x${string}`;
  name: string;
  description: string;
  category: string;
  network: string;
  schema_key?: string | null;
  signedAction: {
    signature: `0x${string}`;
    nonce: string;
    timestamp: number;
  };
};

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  if (!isServerBlockchainConfigured()) {
    return NextResponse.json(
      { error: "Server blockchain configuration missing" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as SyncRequestBody;
  const {
    schemaUid,
    name,
    description,
    category,
    network,
    schema_key,
    signedAction,
  } = body || {};

  if (!schemaUid || !name || !description || !category || !network) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  if (!isBytes32Hex(schemaUid)) {
    return NextResponse.json({ error: "Invalid schema UID" }, { status: 400 });
  }

  const networkConfig = await getNetworkConfig(network, {
    includeDisabled: false,
  });

  if (!networkConfig?.enabled) {
    return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
  }

  const activeWallet = getActiveWallet(req);
  if (!activeWallet) {
    return NextResponse.json(
      { error: "Active wallet required" },
      { status: 428 },
    );
  }

  if (!signedAction?.signature || !signedAction?.nonce) {
    return NextResponse.json(
      { error: "Missing signed action" },
      { status: 400 },
    );
  }

  let resolvedSchemaKey: string | null = null;
  if (schema_key) {
    const keyCheck = await ensureActiveSchemaKey(schema_key);
    if (!keyCheck.ok) {
      return NextResponse.json({ error: keyCheck.error }, { status: 400 });
    }
    resolvedSchemaKey = keyCheck.key || null;
  }

  const verifyResult = await verifyAdminSignedAction({
    address: activeWallet,
    chainId: APP_CHAIN_ID,
    message: {
      action: "sync",
      network: networkConfig.name,
      schemaDefinitionHash: keccak256(stringToHex("")),
      schemaUid,
      transactionHash: "",
      timestamp: signedAction.timestamp,
      nonce: signedAction.nonce,
    },
    signature: signedAction.signature,
  });

  if (!verifyResult.valid) {
    return NextResponse.json({ error: verifyResult.error }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("attestation_schemas")
    .select("id")
    .eq("schema_uid", schemaUid)
    .eq("network", networkConfig.name)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { success: true, schemaUid, message: "Schema already exists" },
      { status: 200 },
    );
  }

  const publicClient = createPublicClientForNetwork({
    chainId: networkConfig.chainId,
    rpcUrl: networkConfig.rpcUrl,
  });

  const onChain = await verifySchemaOnChain(
    publicClient,
    {
      schemaRegistryAddress:
        networkConfig.schemaRegistryAddress as `0x${string}`,
    },
    schemaUid,
  );

  if (!onChain.exists || !onChain.schemaDefinition) {
    return NextResponse.json(
      { error: "Schema not found on-chain" },
      { status: 404 },
    );
  }

  const { error } = await supabase.from("attestation_schemas").insert({
    schema_uid: schemaUid,
    name,
    description,
    schema_definition: onChain.schemaDefinition,
    category,
    revocable: Boolean(onChain.revocable),
    network: networkConfig.name,
    schema_key: resolvedSchemaKey,
  });

  if (error) {
    log.error("Failed to sync schema", { error });
    return NextResponse.json(
      { error: "Failed to sync schema" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, schemaUid }, { status: 200 });
}

import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getNetworkConfig } from "@/lib/attestation/core/network-config";
import { createPublicClientForNetwork } from "@/lib/blockchain/config";
import {
  getSchemaFromTransaction,
  verifySchemaOnChain,
} from "@/lib/blockchain/services/schema-deployment-service";
import { verifyAdminSignedAction } from "@/lib/auth/admin-signed-actions";
import { keccak256, stringToHex } from "viem";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";
import { ensureActiveSchemaKey } from "@/lib/attestation/schemas/schema-key-db";

const log = getLogger("api:admin:eas-schemas:reconcile");

const getActiveWallet = (req: NextRequest): `0x${string}` | null => {
  const header = req.headers.get("x-active-wallet");
  if (!header) return null;
  return header.toLowerCase() as `0x${string}`;
};

type ReconcileRequestBody = {
  transactionHash: `0x${string}`;
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

  const body = (await req.json()) as ReconcileRequestBody;
  const {
    transactionHash,
    name,
    description,
    category,
    network,
    schema_key,
    signedAction,
  } = body || {};

  if (!transactionHash || !name || !description || !category || !network) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  if (!isBytes32Hex(transactionHash)) {
    return NextResponse.json(
      { error: "Invalid transaction hash" },
      { status: 400 },
    );
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
    chainId: networkConfig.chainId,
    message: {
      action: "reconcile",
      network: networkConfig.name,
      schemaDefinitionHash: keccak256(stringToHex("")),
      schemaUid: "",
      transactionHash,
      timestamp: signedAction.timestamp,
      nonce: signedAction.nonce,
    },
    signature: signedAction.signature,
  });

  if (!verifyResult.valid) {
    return NextResponse.json({ error: verifyResult.error }, { status: 401 });
  }

  const publicClient = createPublicClientForNetwork({
    chainId: networkConfig.chainId,
    rpcUrl: networkConfig.rpcUrl,
  });

  const derived = await getSchemaFromTransaction(
    publicClient,
    {
      schemaRegistryAddress:
        networkConfig.schemaRegistryAddress as `0x${string}`,
    },
    transactionHash,
  );

  if (!derived.success || !derived.schemaUid) {
    return NextResponse.json(
      { error: derived.error || "Invalid transaction" },
      { status: 400 },
    );
  }

  const schemaUid = derived.schemaUid;
  if (!isBytes32Hex(schemaUid)) {
    return NextResponse.json({ error: "Invalid schema UID" }, { status: 400 });
  }
  const schemaUidHex = schemaUid as `0x${string}`;
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

  const onChain = await verifySchemaOnChain(
    publicClient,
    {
      schemaRegistryAddress:
        networkConfig.schemaRegistryAddress as `0x${string}`,
    },
    schemaUidHex,
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
    log.error("Failed to reconcile schema", { error });
    return NextResponse.json(
      { error: "Failed to reconcile schema" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, schemaUid }, { status: 200 });
}

import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getNetworkConfig } from "@/lib/attestation/core/network-config";
import {
  createPublicClientForNetwork,
  createWalletClientForNetwork,
  isServerBlockchainConfigured,
  CHAIN_ID as APP_CHAIN_ID,
} from "@/lib/blockchain/config";
import {
  deploySchema,
  verifySchemaOnChain,
} from "@/lib/blockchain/services/schema-deployment-service";
import { verifyAdminSignedAction } from "@/lib/auth/admin-signed-actions";
import { keccak256, stringToHex } from "viem";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";

const log = getLogger("api:admin:eas-schemas:redeploy");

const getActiveWallet = (req: NextRequest): `0x${string}` | null => {
  const header = req.headers.get("x-active-wallet");
  if (!header) return null;
  return header.toLowerCase() as `0x${string}`;
};

type RedeployRequestBody = {
  network: string;
  signedAction: {
    signature: `0x${string}`;
    nonce: string;
    timestamp: number;
  };
};

export async function POST(
  req: NextRequest,
  context: { params: { uid: string } },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  if (!isServerBlockchainConfigured()) {
    return NextResponse.json(
      { error: "Server blockchain configuration missing" },
      { status: 500 },
    );
  }

  const { uid } = await context.params;
  const schemaUid = uid;
  const { network, signedAction } = (await req.json()) as RedeployRequestBody;

  if (!schemaUid || !network) {
    return NextResponse.json(
      { error: "schema_uid and network are required" },
      { status: 400 },
    );
  }

  if (!signedAction?.signature || !signedAction?.nonce) {
    return NextResponse.json(
      { error: "Missing signed action" },
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

  const supabase = createAdminClient();
  const { data: schema, error } = await supabase
    .from("attestation_schemas")
    .select("*")
    .eq("schema_uid", schemaUid)
    .eq("network", networkConfig.name)
    .maybeSingle();

  if (error || !schema) {
    return NextResponse.json({ error: "Schema not found" }, { status: 404 });
  }

  const { count } = await supabase
    .from("attestations")
    .select("id", { count: "exact", head: true })
    .eq("schema_uid", schemaUid)
    .eq("network", networkConfig.name);

  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: "Schema has attestations and cannot be redeployed" },
      { status: 409 },
    );
  }

  const schemaDefinitionHash = keccak256(stringToHex(schema.schema_definition));
  const verifyResult = await verifyAdminSignedAction({
    address: activeWallet,
    chainId: APP_CHAIN_ID,
    message: {
      action: "redeploy",
      network: networkConfig.name,
      schemaDefinitionHash,
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

  const publicClient = createPublicClientForNetwork({
    chainId: networkConfig.chainId,
    rpcUrl: networkConfig.rpcUrl,
  });

  const onChainResult = isBytes32Hex(schemaUid)
    ? await verifySchemaOnChain(
        publicClient,
        {
          schemaRegistryAddress:
            networkConfig.schemaRegistryAddress as `0x${string}`,
        },
        schemaUid as `0x${string}`,
      )
    : { exists: false };

  if (onChainResult.exists) {
    return NextResponse.json(
      { error: "Schema already exists on-chain" },
      { status: 409 },
    );
  }

  const walletClient = createWalletClientForNetwork({
    chainId: networkConfig.chainId,
    rpcUrl: networkConfig.rpcUrl,
  });

  if (!walletClient) {
    return NextResponse.json(
      { error: "Server wallet unavailable" },
      { status: 500 },
    );
  }

  const deployResult = await deploySchema(
    walletClient,
    publicClient,
    {
      schemaRegistryAddress:
        networkConfig.schemaRegistryAddress as `0x${string}`,
    },
    { schemaDefinition: schema.schema_definition, revocable: schema.revocable },
  );

  if (!deployResult.success || !deployResult.schemaUid) {
    return NextResponse.json(
      {
        error: deployResult.error || "Schema deployment failed",
        transactionHash: deployResult.transactionHash,
      },
      { status: 500 },
    );
  }

  const { error: updateError } = await supabase
    .from("attestation_schemas")
    .update({ schema_uid: deployResult.schemaUid })
    .eq("schema_uid", schemaUid)
    .eq("network", networkConfig.name);

  if (updateError) {
    log.error("Failed to update schema UID after redeploy", { updateError });
    return NextResponse.json(
      { error: "Schema redeployed but database update failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      schemaUid: deployResult.schemaUid,
      transactionHash: deployResult.transactionHash,
      previousSchemaUid: schemaUid,
    },
    { status: 200 },
  );
}

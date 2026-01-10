import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { isValidSchemaDefinition } from "@/lib/attestation/utils/validator";
import {
  getNetworkConfig,
  resolveNetworkConfig,
} from "@/lib/attestation/core/network-config";
import {
  createPublicClientForNetwork,
  createWalletClientForNetwork,
  isServerBlockchainConfigured,
} from "@/lib/blockchain/config";
import { deploySchema } from "@/lib/blockchain/services/schema-deployment-service";
import { verifyAdminSignedAction } from "@/lib/auth/admin-signed-actions";
import { keccak256, stringToHex } from "viem";
import { ensureActiveSchemaKey } from "@/lib/attestation/schemas/schema-key-db";

const log = getLogger("api:admin:eas-schemas");

const ALLOWED_CATEGORIES = [
  "attendance",
  "social",
  "verification",
  "review",
  "achievement",
  "payment",
  "reward",
] as const;

type AllowedCategory = (typeof ALLOWED_CATEGORIES)[number];

type DeployRequestBody = {
  name: string;
  description: string;
  schema_definition: string;
  category: AllowedCategory;
  revocable?: boolean;
  network: string;
  schema_key?: string | null;
  signedAction: {
    signature: `0x${string}`;
    nonce: string;
    timestamp: number;
  };
};

const getActiveWallet = (req: NextRequest): `0x${string}` | null => {
  const header = req.headers.get("x-active-wallet");
  if (!header) return null;
  return header.toLowerCase() as `0x${string}`;
};

const buildSchemaDefinitionHash = (schemaDefinition: string): `0x${string}` =>
  keccak256(stringToHex(schemaDefinition));

export async function GET(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const category = url.searchParams.get("category") || undefined;
  const network = url.searchParams.get("network") || undefined;

  const networkConfig = network
    ? await getNetworkConfig(network, { includeDisabled: false })
    : await resolveNetworkConfig(undefined, { includeDisabled: false });

  if (!networkConfig?.enabled) {
    return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("attestation_schemas")
    .select("*")
    .eq("network", networkConfig.name)
    .order("name");

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    log.error("Failed to list schemas", { error });
    return NextResponse.json(
      { error: "Failed to list schemas" },
      { status: 500 },
    );
  }

  return NextResponse.json({ schemas: data || [] }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  if (!isServerBlockchainConfigured()) {
    return NextResponse.json(
      { error: "Server blockchain configuration missing" },
      { status: 500 },
    );
  }

  const body = (await req.json()) as DeployRequestBody;
  const {
    name,
    description,
    schema_definition: schemaDefinition,
    category,
    revocable = false,
    network,
    schema_key,
    signedAction,
  } = body || {};

  if (!name || !description || !schemaDefinition || !category || !network) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  if (!isValidSchemaDefinition(schemaDefinition)) {
    return NextResponse.json(
      { error: "Invalid schema definition" },
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
    return NextResponse.json({ error: "Missing signed action" }, { status: 400 });
  }

  let resolvedSchemaKey: string | null = null;
  if (schema_key) {
    const keyCheck = await ensureActiveSchemaKey(schema_key);
    if (!keyCheck.ok) {
      return NextResponse.json({ error: keyCheck.error }, { status: 400 });
    }
    resolvedSchemaKey = keyCheck.key || null;
  }

  const schemaDefinitionHash = buildSchemaDefinitionHash(schemaDefinition);

  const verifyResult = await verifyAdminSignedAction({
    address: activeWallet,
    chainId: networkConfig.chainId,
    message: {
      action: "deploy",
      network: networkConfig.name,
      schemaDefinitionHash,
      schemaUid: "",
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
    .eq("network", networkConfig.name)
    .eq("schema_definition", schemaDefinition)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Schema already exists" },
      { status: 409 },
    );
  }

  const publicClient = createPublicClientForNetwork({
    chainId: networkConfig.chainId,
    rpcUrl: networkConfig.rpcUrl,
  });
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
    { schemaRegistryAddress: networkConfig.schemaRegistryAddress as `0x${string}` },
    { schemaDefinition, revocable },
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

  const schemaUid = deployResult.schemaUid;
  let insertError: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.from("attestation_schemas").insert({
      schema_uid: schemaUid,
      name,
      description,
      schema_definition: schemaDefinition,
      category,
      revocable: Boolean(revocable),
      network: networkConfig.name,
      schema_key: resolvedSchemaKey,
    });

    if (!error) {
      insertError = null;
      break;
    }

    insertError = error.message;
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  if (insertError) {
    return NextResponse.json(
      {
        error: "Schema deployed but database insert failed",
        transactionHash: deployResult.transactionHash,
        schemaUid,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      schemaUid,
      transactionHash: deployResult.transactionHash,
    },
    { status: 200 },
  );
}

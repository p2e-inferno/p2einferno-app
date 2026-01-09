import { NextRequest, NextResponse } from "next/server";
import { ensureAdminOrRespond } from "@/lib/auth/route-handlers/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { getNetworkConfig } from "@/lib/attestation/core/network-config";
import { createPublicClientForNetwork } from "@/lib/blockchain/config";
import { verifySchemaOnChain } from "@/lib/blockchain/services/schema-deployment-service";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";
import { ensureActiveSchemaKey } from "@/lib/attestation/schemas/schema-key-db";

const log = getLogger("api:admin:eas-schema");

const getActiveWallet = (req: NextRequest): `0x${string}` | null => {
  const header = req.headers.get("x-active-wallet");
  if (!header) return null;
  return header.toLowerCase() as `0x${string}`;
};

export async function GET(
  req: NextRequest,
  context: { params: { uid: string } },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { uid } = await context.params;
  const schemaUid = uid;
  const url = new URL(req.url);
  const network = url.searchParams.get("network") || undefined;

  if (!schemaUid || !network) {
    return NextResponse.json(
      { error: "schema_uid and network are required" },
      { status: 400 },
    );
  }

  const networkConfig = await getNetworkConfig(network, {
    includeDisabled: false,
  });

  if (!networkConfig?.enabled) {
    return NextResponse.json({ error: "Unsupported network" }, { status: 400 });
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

  let onChainResult = { exists: false };
  if (isBytes32Hex(schemaUid)) {
    const publicClient = createPublicClientForNetwork({
      chainId: networkConfig.chainId,
      rpcUrl: networkConfig.rpcUrl,
    });
    onChainResult = await verifySchemaOnChain(
      publicClient,
      { schemaRegistryAddress: networkConfig.schemaRegistryAddress as `0x${string}` },
      schemaUid as `0x${string}`,
    );
  }

  const { count } = await supabase
    .from("attestations")
    .select("id", { count: "exact", head: true })
    .eq("schema_uid", schemaUid)
    .eq("network", networkConfig.name);

  return NextResponse.json(
    {
      schema,
      attestationCount: count || 0,
      onChain: onChainResult.exists,
    },
    { status: 200 },
  );
}

export async function PATCH(
  req: NextRequest,
  context: { params: { uid: string } },
) {
  const guard = await ensureAdminOrRespond(req);
  if (guard) return guard;

  const { uid } = await context.params;
  const schemaUid = uid;
  const url = new URL(req.url);
  const network = url.searchParams.get("network") || undefined;

  if (!schemaUid || !network) {
    return NextResponse.json(
      { error: "schema_uid and network are required" },
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

  const { name, description, schema_key } = (await req.json()) as {
    name?: string;
    description?: string;
    schema_key?: string | null;
  };

  if (name === undefined && description === undefined && schema_key === undefined) {
    return NextResponse.json(
      { error: "No updates provided" },
      { status: 400 },
    );
  }

  let resolvedSchemaKey: string | null | undefined = undefined;
  if (schema_key !== undefined) {
    if (schema_key === null || schema_key === "") {
      resolvedSchemaKey = null;
    } else {
      const keyCheck = await ensureActiveSchemaKey(schema_key);
      if (!keyCheck.ok) {
        return NextResponse.json({ error: keyCheck.error }, { status: 400 });
      }
      resolvedSchemaKey = keyCheck.key || null;
    }
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("attestation_schemas")
    .update({
      name: name ?? undefined,
      description: description ?? undefined,
      schema_key: resolvedSchemaKey,
    })
    .eq("schema_uid", schemaUid)
    .eq("network", networkConfig.name);

  if (error) {
    log.error("Failed to update schema", { error });
    return NextResponse.json({ error: "Failed to update schema" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

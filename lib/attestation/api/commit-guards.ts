import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("lib:attestation:api:commit-guards");

export type DecodedField = { name: string; value: any; type?: string };

export async function resolveSchemaDefinition(params: {
  supabase: SupabaseClient;
  schemaKey: string;
  network: string;
}): Promise<string | null> {
  const { supabase, schemaKey, network } = params;
  const { data, error } = await supabase
    .from("attestation_schemas")
    .select("schema_definition")
    .eq("schema_key", schemaKey)
    .eq("network", network)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn("Failed to resolve schema definition", {
      schemaKey,
      network,
      error: error.message,
    });
    return null;
  }

  const schemaDefinition = (data as any)?.schema_definition;
  return typeof schemaDefinition === "string" && schemaDefinition.length > 0
    ? schemaDefinition
    : null;
}

export async function decodeAttestationDataFromDb(params: {
  supabase: SupabaseClient;
  schemaKey: string;
  network: string;
  encodedData: string;
}): Promise<DecodedField[] | null> {
  const schemaDefinition = await resolveSchemaDefinition(params);
  if (!schemaDefinition) return null;

  try {
    const { SchemaEncoder } = require("@ethereum-attestation-service/eas-sdk");
    const encoder = new SchemaEncoder(schemaDefinition);
    return encoder.decodeData(params.encodedData) as DecodedField[];
  } catch (error: any) {
    log.warn("Failed to decode attestation payload", {
      schemaKey: params.schemaKey,
      network: params.network,
      error: error?.message || String(error),
    });
    return null;
  }
}

export function getDecodedFieldValue(
  decoded: DecodedField[] | null,
  fieldName: string,
): any | undefined {
  if (!decoded) return undefined;
  return decoded.find((item) => item.name === fieldName)?.value;
}

export function normalizeBytes32(value: any): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  if (!normalized.startsWith("0x") || normalized.length !== 66) return null;
  return normalized;
}

export function normalizeUint(value: any): bigint | null {
  if (value === null || value === undefined) return null;
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string" && value.length > 0) return BigInt(value);
    return null;
  } catch {
    return null;
  }
}

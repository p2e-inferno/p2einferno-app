import type { SupabaseClient } from "@supabase/supabase-js";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("lib:attestation:api:commit-guards");

export type DecodedField = { name: string; value: any; type?: string };

function unwrapDecodedFieldValue(value: any): any {
  let current = value;
  // Some runtimes return nested wrappers like { name, type, value }.
  // Unwrap a few levels defensively to recover the primitive.
  for (let i = 0; i < 4; i += 1) {
    if (
      current &&
      typeof current === "object" &&
      "value" in (current as Record<string, unknown>)
    ) {
      current = (current as { value: unknown }).value;
      continue;
    }
    break;
  }
  return current;
}

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
  const raw = decoded.find((item) => item.name === fieldName)?.value;
  return unwrapDecodedFieldValue(raw);
}

export function normalizeBytes32(value: any): string | null {
  let normalizedValue: string | null = null;

  if (typeof value === "string") {
    normalizedValue = value;
  } else if (value instanceof Uint8Array) {
    normalizedValue = `0x${Array.from(value)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  } else if (
    value &&
    typeof value === "object" &&
    typeof (value as { hex?: unknown }).hex === "string"
  ) {
    normalizedValue = (value as { hex: string }).hex;
  } else if (
    value &&
    typeof value === "object" &&
    typeof (value as { toString?: unknown }).toString === "function"
  ) {
    const asString = (value as { toString: () => string }).toString();
    if (typeof asString === "string" && asString.startsWith("0x")) {
      normalizedValue = asString;
    }
  }

  if (typeof normalizedValue !== "string") return null;
  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)
  ) {
    normalizedValue = `0x${(value as number[])
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("")}`;
  }

  if (typeof normalizedValue !== "string") return null;
  const normalized = normalizedValue.toLowerCase();
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

import { supabase } from "@/lib/supabase";
import { getLogger } from "@/lib/utils/logger";
import { resolveSchemaUIDFromEnv, type SchemaKey } from "@/lib/attestation/core/config";
import { getDefaultNetworkName } from "../core/network-config";

const log = getLogger("attestation:schema-resolver");

const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  value: string | null;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

const getCacheKey = (schemaKey: SchemaKey, network: string): string =>
  `${schemaKey}:${network}`;

const getCachedValue = (key: string): string | null | undefined => {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
};

const setCachedValue = (key: string, value: string | null): void => {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
};

export const resolveSchemaUID = async (
  schemaKey: SchemaKey,
  network?: string,
): Promise<string | null> => {
  const resolvedNetwork = network || getDefaultNetworkName();
  const cacheKey = getCacheKey(schemaKey, resolvedNetwork);
  const cached = getCachedValue(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  try {
    const { data, error } = await supabase
      .from("attestation_schemas")
      .select("schema_uid")
      .eq("schema_key", schemaKey)
      .eq("network", resolvedNetwork)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      log.warn("Failed to resolve schema UID from DB", {
        schemaKey,
        network: resolvedNetwork,
        error: error.message,
      });
    }

    const schemaUid = (data as any)?.schema_uid;
    if (typeof schemaUid === "string" && schemaUid.length > 0) {
      setCachedValue(cacheKey, schemaUid);
      return schemaUid;
    }
  } catch (error: any) {
    log.warn("Schema UID DB lookup failed", {
      schemaKey,
      network: resolvedNetwork,
      error: error?.message || "unknown error",
    });
  }

  const fallback = resolveSchemaUIDFromEnv(schemaKey);

  // Fail-fast: If not found in DB AND no fallback in env, this is a failure
  if (!fallback) {
    const errorMsg = `Critical: Schema UID for '${schemaKey}' not resolved on network '${resolvedNetwork}'. ` +
      "Please ensure it is added to the attestation_schemas table or configured in environment variables.";
    log.error(errorMsg);

    // We cache null so we don't spam the DB, but we throw for the caller
    setCachedValue(cacheKey, null);
    throw new Error(errorMsg);
  }

  setCachedValue(cacheKey, fallback);
  return fallback;
};

export const __clearSchemaResolverCacheForTests = (): void => {
  cache.clear();
};

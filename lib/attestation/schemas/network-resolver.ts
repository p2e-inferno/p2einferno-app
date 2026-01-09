import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { resolveSchemaUIDFromEnv, type SchemaKey } from "@/lib/attestation/core/config";

const log = getLogger("attestation:schema-resolver");

const CACHE_TTL_MS = 30_000;

type CacheEntry = {
  value: string | null;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

const getDefaultNetworkName = (): string =>
  process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || "base-sepolia";

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
    const supabase = createAdminClient();
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

    if (data?.schema_uid) {
      setCachedValue(cacheKey, data.schema_uid);
      return data.schema_uid;
    }
  } catch (error: any) {
    log.warn("Schema UID DB lookup failed", {
      schemaKey,
      network: resolvedNetwork,
      error: error?.message || "unknown error",
    });
  }

  const fallback = resolveSchemaUIDFromEnv(schemaKey);
  setCachedValue(cacheKey, fallback || null);
  return fallback || null;
};

export const __clearSchemaResolverCacheForTests = (): void => {
  cache.clear();
};

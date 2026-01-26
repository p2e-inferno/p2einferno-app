import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { EAS_CONFIG } from "@/lib/attestation/core/config";

const log = getLogger("attestation:network-config");

const CACHE_TTL_MS = 30_000;

type EasNetworkRow = {
  name: string;
  chain_id: number;
  display_name: string;
  is_testnet: boolean;
  enabled: boolean;
  eas_contract_address: string;
  schema_registry_address: string;
  eip712_proxy_address: string | null;
  eas_scan_base_url: string | null;
  explorer_base_url: string | null;
  rpc_url: string | null;
  source: string | null;
  source_commit: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type EasNetworkConfig = {
  name: string;
  chainId: number;
  displayName: string;
  isTestnet: boolean;
  enabled: boolean;
  easContractAddress: string;
  schemaRegistryAddress: string;
  eip712ProxyAddress: string | null;
  easScanBaseUrl: string | null;
  explorerBaseUrl: string | null;
  rpcUrl: string | null;
  source: string | null;
  sourceCommit: string | null;
};

type CacheState = {
  expiresAt: number;
  data: EasNetworkConfig[];
};

let cacheState: CacheState | null = null;

const mapRow = (row: EasNetworkRow): EasNetworkConfig => ({
  name: row.name,
  chainId: row.chain_id,
  displayName: row.display_name,
  isTestnet: row.is_testnet,
  enabled: row.enabled,
  easContractAddress: row.eas_contract_address,
  schemaRegistryAddress: row.schema_registry_address,
  eip712ProxyAddress: row.eip712_proxy_address,
  easScanBaseUrl: row.eas_scan_base_url,
  explorerBaseUrl: row.explorer_base_url,
  rpcUrl: row.rpc_url,
  source: row.source,
  sourceCommit: row.source_commit,
});

const buildFallbackConfig = (): EasNetworkConfig => ({
  name: EAS_CONFIG.NETWORK,
  chainId: EAS_CONFIG.CHAIN_ID,
  displayName: "Base Sepolia (Fallback)",
  isTestnet: true,
  enabled: true,
  easContractAddress: EAS_CONFIG.CONTRACT_ADDRESS,
  schemaRegistryAddress: EAS_CONFIG.SCHEMA_REGISTRY_ADDRESS,
  eip712ProxyAddress: null,
  easScanBaseUrl: "https://base-sepolia.easscan.org",
  explorerBaseUrl: null,
  rpcUrl: null,
  source: "static-fallback",
  sourceCommit: null,
});

const loadFromDb = async (): Promise<EasNetworkConfig[] | null> => {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("eas_networks")
      .select("*")
      .order("name");
    if (error) {
      log.warn("Failed to load eas_networks from DB", { error: error.message });
      return null;
    }
    return (data || []).map(mapRow);
  } catch (error: any) {
    log.warn("Failed to load eas_networks from DB", {
      error: error?.message || "unknown error",
    });
    return null;
  }
};

const getCachedNetworks = async (
  bypassCache?: boolean,
): Promise<EasNetworkConfig[]> => {
  if (bypassCache) {
    const data = await loadFromDb();
    if (data && data.length > 0) {
      cacheState = { data, expiresAt: Date.now() + CACHE_TTL_MS };
      return data;
    }
  }
  const now = Date.now();
  if (cacheState && cacheState.expiresAt > now) {
    return cacheState.data;
  }
  const data = await loadFromDb();
  if (data && data.length > 0) {
    cacheState = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  }
  const fallback = buildFallbackConfig();
  cacheState = { data: [fallback], expiresAt: now + CACHE_TTL_MS };
  return [fallback];
};

export const getDefaultNetworkName = (): string =>
  process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK || EAS_CONFIG.NETWORK;

export const getAllNetworks = async (options?: {
  includeDisabled?: boolean;
  bypassCache?: boolean;
}): Promise<EasNetworkConfig[]> => {
  const includeDisabled = options?.includeDisabled ?? false;
  const networks = await getCachedNetworks(options?.bypassCache);
  return includeDisabled
    ? networks
    : networks.filter((network) => network.enabled);
};

export const getNetworkConfig = async (
  name: string,
  options?: { includeDisabled?: boolean },
): Promise<EasNetworkConfig | null> => {
  const includeDisabled = options?.includeDisabled ?? false;
  const networks = await getAllNetworks({ includeDisabled });
  return networks.find((network) => network.name === name) || null;
};

export const resolveNetworkConfig = async (
  name?: string,
  options?: { includeDisabled?: boolean },
): Promise<EasNetworkConfig> => {
  const targetName = name || getDefaultNetworkName();
  const network =
    (await getNetworkConfig(targetName, options)) ||
    (await getNetworkConfig(EAS_CONFIG.NETWORK, { includeDisabled: true }));
  return network || buildFallbackConfig();
};

export const buildEasScanLink = async (
  uid: string,
  networkName?: string,
): Promise<string | null> => {
  if (!uid || typeof uid !== "string") {
    return null;
  }

  const network = await resolveNetworkConfig(networkName);
  const baseUrl = network.easScanBaseUrl?.replace(/\/+$/, "") || "";
  return baseUrl ? `${baseUrl}/attestation/view/${uid}` : null;
};

export const __clearNetworkConfigCacheForTests = (): void => {
  cacheState = null;
};

export const invalidateNetworkConfigCache = (): void => {
  cacheState = null;
};

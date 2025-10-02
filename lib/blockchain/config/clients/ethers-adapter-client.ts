/**
 * Ethers-based adapter with viem-compatible interface
 */

import { ethers } from "ethers";
import { resolveChain, getAlchemyBaseUrl, createAlchemyRpcUrl, getPreferredProvider } from "../core/chain-resolution";
import { blockchainLogger } from "../../shared/logging-utils";

const cachedAdapters = new Map<string, any>();

type PreferredProvider = "alchemy" | "infura";

interface ReadContractParameters {
  address: string;
  abi: any[];
  functionName: string;
  args?: readonly unknown[];
}

class EthersViemAdapter {
  private ethersProvider: ethers.JsonRpcProvider;

  constructor(provider: ethers.JsonRpcProvider, _chainId: number, _chainName: string) {
    this.ethersProvider = provider;
  }

  async readContract<T = any>(params: ReadContractParameters): Promise<T> {
    const { address, abi, functionName, args = [] } = params;
    const contract = new ethers.Contract(address, abi, this.ethersProvider);
    
    // Verify function exists on contract
    const contractFunction = contract[functionName];
    if (!contractFunction || typeof contractFunction !== 'function') {
      throw new Error(`Function ${functionName} not found on contract ${address}`);
    }
    
    const result = await contractFunction(...args);
    return result as T;
  }
}

// Create a proxy that forwards all method calls to the provider
function createEthersViemAdapter(provider: ethers.JsonRpcProvider, chainId: number, chainName: string): any {
  const adapter = new EthersViemAdapter(provider, chainId, chainName);
  
  return new Proxy(adapter, {
    get(target, prop) {
      // If the property exists on the adapter, use it
      if (prop in target) {
        return target[prop as keyof EthersViemAdapter];
      }
      // Otherwise, forward to the provider
      const providerMethod = provider[prop as keyof ethers.JsonRpcProvider];
      if (typeof providerMethod === 'function') {
        return providerMethod.bind(provider);
      }
      return providerMethod;
    }
  });
}

/**
 * Resolve a single preferred RPC URL for the current chain.
 * If the preferred keyed URL is unavailable, fall back to public Base RPC.
 */
function resolvePreferredRpcUrl(chainId: number, prefer: PreferredProvider): string {
  if (prefer === "alchemy") {
    const baseUrl = getAlchemyBaseUrl(chainId);
    return createAlchemyRpcUrl(baseUrl);
  }

  const infuraKey = process.env.NEXT_PUBLIC_INFURA_API_KEY;
  if (chainId === 8453) {
    const direct = process.env.NEXT_PUBLIC_INFURA_BASE_MAINNET_RPC_URL;
    if (direct) return direct;
    if (infuraKey) return `https://base-mainnet.infura.io/v3/${infuraKey}`;
    return "https://mainnet.base.org";
  } else {
    const direct = process.env.NEXT_PUBLIC_INFURA_BASE_SEPOLIA_RPC_URL;
    if (direct) return direct;
    if (infuraKey) return `https://base-sepolia.infura.io/v3/${infuraKey}`;
    return "https://sepolia.base.org";
  }
}

/**
 * Create ethers adapter with viem-like interface for the preferred provider.
 * Does not implement multi-URL fallback; single preferred with public fallback only.
 */
export const createEthersAdapterReadClient = (opts?: { prefer?: PreferredProvider }): any => {
  const { chain } = resolveChain();
  const prefer: PreferredProvider = opts?.prefer ?? getPreferredProvider();
  const url = resolvePreferredRpcUrl(chain.id, prefer);
  const cacheKey = `${prefer}:${chain.id}`;

  const cached = cachedAdapters.get(cacheKey);
  if (cached) return cached;

  blockchainLogger.info("Creating ethers adapter (viem interface)", {
    operation: "ethers-adapter:create",
    chainId: chain.id,
    networkName: chain.name,
    prefer,
    host: (() => { try { return new URL(url).host; } catch { return "[unparseable]"; } })(),
  });

  const provider = new ethers.JsonRpcProvider(
    url,
    { chainId: chain.id, name: chain.name }
  );
  const adapter = createEthersViemAdapter(provider, chain.id, chain.name);
  cachedAdapters.set(cacheKey, adapter);
  return adapter;
};

/**
 * Backwards-compatible Alchemy creator.
 */
export const createAlchemyEthersAdapterReadClient = (): any => {
  return createEthersAdapterReadClient({ prefer: "alchemy" });
};

/**
 * New Infura creator.
 */
export const createInfuraEthersAdapterReadClient = (): any => {
  return createEthersAdapterReadClient({ prefer: "infura" });
};
/**
 * Ethers-based adapter with viem-compatible interface
 */

import { ethers } from "ethers";
import { resolveChain, getAlchemyBaseUrl, createAlchemyRpcUrl } from "../core/chain-resolution";
import { blockchainLogger } from "../../shared/logging-utils";

let cachedEthersAdapter: any = null;

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
 * Create Alchemy-based ethers adapter with viem interface
 * Falls back to public RPC if no Alchemy API key found
 * Uses default ethers settings (no custom timeout/retries)
 */
export const createAlchemyEthersAdapterReadClient = (): any => {
  const { chain } = resolveChain();
  
  // Return cached adapter if available
  if (cachedEthersAdapter) {
    return cachedEthersAdapter;
  }

  const baseUrl = getAlchemyBaseUrl(chain.id);
  const alchemyUrl = createAlchemyRpcUrl(baseUrl);
  
  blockchainLogger.info("Creating Alchemy ethers adapter (viem interface)", {
    operation: "ethers-adapter:create",
    chainId: chain.id,
    networkName: chain.name,
    hasApiKey: !!process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
  });

  // Create ethers provider with default settings (no custom timeout/retries)
  const provider = new ethers.JsonRpcProvider(
    alchemyUrl,
    { chainId: chain.id, name: chain.name }
  );

  const adapter = createEthersViemAdapter(provider, chain.id, chain.name);
  cachedEthersAdapter = adapter;
  
  return adapter;
};
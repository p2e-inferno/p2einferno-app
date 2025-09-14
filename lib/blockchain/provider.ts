import { ethers } from 'ethers';
import { getClientRpcUrls, getClientConfig } from './config/unified-config';
import { blockchainLogger } from './shared/logging-utils';

let readOnlyProviderSingleton: ethers.JsonRpcProvider | ethers.FallbackProvider | null = null;

const parseHost = (u: string) => { try { return new URL(u).host; } catch { return '[unparseable]'; } };
const isKeyedHost = (h: string) => /alchemy\.com$/i.test(h) || /infura\.io$/i.test(h);
const isPublicBaseHost = (h: string) => /\.base\.org$/i.test(h);

function buildReadOnlyProvider() {
  const cfg = getClientConfig();
  const allUrls = getClientRpcUrls();
  const hostsAll = allUrls.map(parseHost);
  const hasKeyed = hostsAll.some(isKeyedHost);
  const urls = (typeof window !== 'undefined' && hasKeyed)
    ? allUrls.filter((u) => !isPublicBaseHost(parseHost(u)))
    : allUrls;
  const hosts = urls.map(parseHost);

  blockchainLogger.debug('Provider:init', {
    operation: 'provider:create:frontend:unified',
    chainId: cfg.chain.id,
    order: hosts,
    removedPublicBase: hasKeyed ? hostsAll.filter((h) => isPublicBaseHost(h)) : [],
  });

  const providers = urls.map((u) => new ethers.JsonRpcProvider(u));
  if (providers.length === 0) throw new Error('No RPC URLs configured');
  return providers.length > 1 ? new ethers.FallbackProvider(providers) : providers[0]!;
}

export function getReadOnlyProvider(): ethers.JsonRpcProvider | ethers.FallbackProvider {
  if (!readOnlyProviderSingleton) {
    readOnlyProviderSingleton = buildReadOnlyProvider();
  }
  return readOnlyProviderSingleton;
}

export function getBrowserProvider(): ethers.BrowserProvider {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('window.ethereum not available');
  }
  return new ethers.BrowserProvider((window as any).ethereum);
}


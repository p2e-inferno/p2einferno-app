import { ethers } from "ethers";
import { getClientRpcUrls, getClientConfig } from "@/lib/blockchain/config";
import { blockchainLogger } from "../shared/logging-utils";

let readOnlyProviderSingleton:
  | ethers.JsonRpcProvider
  | ethers.FallbackProvider
  | null = null;

const parseHost = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "[unparseable]";
  }
};
const isKeyedHost = (h: string) =>
  /alchemy\.com$/i.test(h) || /infura\.io$/i.test(h);
const isPublicBaseHost = (h: string) => /\.base\.org$/i.test(h);

function buildReadOnlyProvider() {
  const cfg = getClientConfig();
  const allUrls = getClientRpcUrls();
  const hostsAll = allUrls.map(parseHost);
  const hasKeyed = hostsAll.some(isKeyedHost);

  let urls = allUrls;
  if (typeof window !== "undefined" && hasKeyed) {
    const keyed = allUrls.filter((u) => isKeyedHost(parseHost(u)));
    const publicBase = allUrls.filter((u) => isPublicBaseHost(parseHost(u)));
    const others = allUrls.filter(
      (u) => !keyed.includes(u) && !publicBase.includes(u),
    );
    urls = [...keyed, ...others, ...publicBase];
  }

  const hosts = urls.map(parseHost);

  blockchainLogger.debug("Provider:init", {
    operation: "provider:create:frontend:unified",
    chainId: cfg.chain.id,
    order: hosts,
    keptPublicBaseFallback: hasKeyed,
  });

  if (urls.length === 0) throw new Error("No RPC URLs configured");

  const createEthersProvider = (url: string) => {
    const provider = new ethers.JsonRpcProvider(
      url,
      { chainId: cfg.chain.id, name: cfg.networkName || "unknown" },
      { staticNetwork: true, polling: false },
    );
    return provider;
  };

  if (urls.length === 1) {
    return createEthersProvider(urls[0]!);
  }

  const fallbackProviders = urls.map((u, index) => ({
    provider: createEthersProvider(u),
    priority: index + 1,
    stallTimeout: index === 0 ? 500 : 1500,
    weight: 1,
  }));

  const fallback = new ethers.FallbackProvider(fallbackProviders, 1);
  return fallback;
}

export function getReadOnlyProvider():
  | ethers.JsonRpcProvider
  | ethers.FallbackProvider {
  if (!readOnlyProviderSingleton) {
    readOnlyProviderSingleton = buildReadOnlyProvider();
  }
  return readOnlyProviderSingleton;
}

export function getBrowserProvider(): ethers.BrowserProvider {
  if (typeof window === "undefined" || !(window as any).ethereum) {
    throw new Error("window.ethereum not available");
  }
  return new ethers.BrowserProvider((window as any).ethereum);
}

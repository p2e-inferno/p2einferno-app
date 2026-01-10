import {
  arbitrum,
  arbitrumNova,
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  type Chain,
} from "viem/chains";

const chainMap: Record<number, Chain> = {
  1: mainnet,
  10: optimism,
  11155420: optimismSepolia,
  8453: base,
  84532: baseSepolia,
  42161: arbitrum,
  42170: arbitrumNova,
};

const rpcResolverSupportedChainIds = new Set<number>([1, 8453, 84532]);

export const resolveChainById = (chainId: number): Chain | null =>
  chainMap[chainId] || null;

export const isRpcResolverSupportedChain = (chainId: number): boolean =>
  rpcResolverSupportedChainIds.has(chainId);

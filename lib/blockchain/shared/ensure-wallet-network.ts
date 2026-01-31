import { getClientConfig, getClientRpcUrls } from "@/lib/blockchain/config";
import { resolveChainById } from "@/lib/blockchain/config/core/chain-map";
import { ensureCorrectNetwork } from "@/lib/blockchain/shared/network-utils";

export async function ensureWalletOnAppNetwork(
  rawProvider: any,
): Promise<void> {
  const clientConfig = getClientConfig();
  await ensureCorrectNetwork(rawProvider, {
    chain: clientConfig.chain,
    rpcUrl: clientConfig.rpcUrl,
    networkName: clientConfig.networkName,
  });
}

export async function ensureWalletOnChainId(
  rawProvider: any,
  params: {
    chainId: number;
    rpcUrl?: string | null;
    networkName?: string | null;
  },
): Promise<void> {
  const chain = resolveChainById(params.chainId);
  if (!chain) {
    throw new Error(`Unsupported chainId: ${params.chainId}`);
  }

  const rpcUrl = params.rpcUrl || getClientRpcUrls(params.chainId)[0];
  if (!rpcUrl) {
    throw new Error(
      `No RPC URL configured for chainId ${params.chainId}. Please configure a NEXT_PUBLIC_* RPC URL.`,
    );
  }

  await ensureCorrectNetwork(rawProvider, {
    chain,
    rpcUrl,
    networkName: params.networkName || chain.name,
  });
}

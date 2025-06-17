import { ethers } from "ethers";
import { Config, UnlockProvider } from "@unlock-protocol/unlock-js";

/**
 * Returns a configured UnlockProvider instance.
 * Uses environment variables to resolve RPC endpoints and network.
 *
 * NEXT_PUBLIC_UNLOCK_NETWORK should be the chain id (e.g. 80001 for Mumbai).
 * NEXT_PUBLIC_RPC_PROVIDER      RPC endpoint for the network.
 */
export function getUnlock() {
  const network = Number(process.env.NEXT_PUBLIC_UNLOCK_NETWORK || 80001);
  const rpcProvider = process.env.NEXT_PUBLIC_RPC_PROVIDER;

  if (!rpcProvider) {
    throw new Error("NEXT_PUBLIC_RPC_PROVIDER not set");
  }

  const config: Config = {
    networks: {
      [network]: {
        provider: new ethers.JsonRpcProvider(rpcProvider),
      },
    },
  } as Config;

  return new UnlockProvider(config);
}

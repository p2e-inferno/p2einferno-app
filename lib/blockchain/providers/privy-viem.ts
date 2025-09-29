/**
 * Privy + Viem Integration
 * Client-side Privy wallet integration for viem wallet clients
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  publicActions,
  type WalletClient,
  type PublicClient,
} from "viem";
import { type ConnectedWallet } from "@privy-io/react-auth";
import { getClientConfig } from "../config";
import { createPublicClientUnified } from "../config/clients/public-client";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger('blockchain:privy-viem');

/**
 * Combined wallet and public client from Privy wallet
 * Returns wallet client that also has public client methods
 */
export async function createViemFromPrivyWallet(
  wallet: ConnectedWallet,
): Promise<{ walletClient: WalletClient; publicClient: PublicClient }> {
  if (!wallet || !wallet.address) {
    throw new Error('No wallet provided or wallet not connected');
  }

  log.info('Creating viem client from Privy wallet', {
    address: wallet.address,
    walletClientType: wallet.walletClientType,
    connectorType: wallet.connectorType,
  });

  const config = getClientConfig();

  // Switch to the app's configured chain if needed
  if (wallet.chainId !== `eip155:${config.chainId}`) {
    log.info('Switching wallet to correct chain', {
      currentChain: wallet.chainId,
      targetChain: `eip155:${config.chainId}`,
    });

    try {
      await wallet.switchChain(config.chainId);
    } catch (error) {
      log.error('Failed to switch chain', { error, targetChain: config.chainId });
      throw new Error(`Failed to switch to chain ${config.chainId}`);
    }
  }

  // Get EIP1193 provider from Privy wallet
  let provider: any;
  try {
    provider = await wallet.getEthereumProvider();
  } catch (error) {
    log.error('Failed to get Ethereum provider from wallet', { error });
    throw new Error('Failed to get Ethereum provider from wallet');
  }

  if (!provider) {
    throw new Error('No provider available for wallet');
  }

  // Create wallet client with public actions
  try {
    const baseWalletClient = createWalletClient({
      account: wallet.address as `0x${string}`,
      chain: config.chain,
      transport: custom(provider),
    });
    const walletClient = baseWalletClient.extend(publicActions);

    const publicClient = createViemPublicClient();

    log.info('Viem combined client created successfully', {
      address: wallet.address,
      chainId: config.chainId,
    });

    return { walletClient: walletClient as WalletClient, publicClient };
  } catch (error) {
    log.error('Failed to create viem client', { error });
    throw new Error('Failed to create viem client');
  }
}

/**
 * Create public client for reads (uses unified config)
 */
export function createViemPublicClient(): PublicClient {
  try {
    const publicClient = createPublicClientUnified();
    log.debug('Viem public client created from unified config', {
      chainId: publicClient.chain?.id,
    });
    return publicClient;
  } catch (error) {
    if (typeof window !== "undefined" && (window as any).ethereum) {
      try {
        const config = getClientConfig();
        const fallbackClient = createPublicClient({
          chain: config.chain,
          transport: custom((window as any).ethereum),
        });

        log.warn('Falling back to injected provider for viem public client');
        return fallbackClient as PublicClient;
      } catch (fallbackError) {
        log.error('Failed fallback viem public client creation', {
          error: fallbackError,
        });
      }
    }

    log.error('Failed to create viem public client', { error });
    throw new Error('Failed to create viem public client');
  }
}

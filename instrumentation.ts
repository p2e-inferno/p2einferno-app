// Next.js 15 instrumentation hook for minimal RPC warm-up
// Runs on the server at startup

import { createPublicClientUnified, createInfuraEthersAdapterReadClient } from "./lib/blockchain/config";
import { blockchainLogger } from "./lib/blockchain/shared/logging-utils";

export async function register() {
  if (process.env.ADMIN_RPC_WARMUP_DISABLED === '1') {
    blockchainLogger.info('RPC warm-up skipped (disabled)', { operation: 'warmup' });
    return;
  }

  try {
    const client = createPublicClientUnified();
    const ethersAdapterClient = createInfuraEthersAdapterReadClient();
    const start = Date.now();
    const block = await client.getBlockNumber();
    const block2 = await ethersAdapterClient.getBlockNumber();
    const durationMs = Date.now() - start;
    blockchainLogger.info('RPC warm-up complete', { operation: 'warmup', durationMs, block: block.toString() });
    blockchainLogger.info('Ethers Adapter RPC warm-up complete', { operation: 'warmup', durationMs, block: block2.toString() });
  } catch (err: any) {
    blockchainLogger.warn('RPC warm-up failed', { operation: 'warmup', error: err?.message || String(err) });
  }
}


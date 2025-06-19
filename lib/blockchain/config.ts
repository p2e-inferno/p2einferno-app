import { 
  createWalletClient, 
  createPublicClient, 
  http, 
  type WalletClient, 
  type PublicClient, 
  type Account
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';

// Validate environment variables
const validateEnvironment = () => {
  if (!process.env.LOCK_MANAGER_PRIVATE_KEY) {
    throw new Error('LOCK_MANAGER_PRIVATE_KEY is not set in environment variables');
  }
  
  // Ensure private key is properly formatted
  const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY;
  if (!privateKey.startsWith('0x')) {
    throw new Error('LOCK_MANAGER_PRIVATE_KEY must start with 0x');
  }
  
  if (privateKey.length !== 66) {
    throw new Error('LOCK_MANAGER_PRIVATE_KEY must be 64 characters long (excluding 0x prefix)');
  }
  
  return privateKey as `0x${string}`;
};

// Chain configuration
export const CHAIN_CONFIG = {
  chain: base,
  rpcUrl: process.env.BASE_RPC_URL || 'https://mainnet.base.org',
};

// Create account from private key
const createLockManagerAccount = (): Account => {
  try {
    const privateKey = validateEnvironment();
    return privateKeyToAccount(privateKey);
  } catch (error) {
    console.error('Failed to create lock manager account:', error);
    throw error;
  }
};

// Create public client for reading from blockchain
export const createBlockchainPublicClient = () => {
  return createPublicClient({
    chain: CHAIN_CONFIG.chain,
    transport: http(CHAIN_CONFIG.rpcUrl),
  }) as PublicClient;
};

// Create wallet client for writing to blockchain
export const createBlockchainWalletClient = () => {
  const account = createLockManagerAccount();
  
  return createWalletClient({
    account,
    chain: CHAIN_CONFIG.chain,
    transport: http(CHAIN_CONFIG.rpcUrl),
  }) as WalletClient;
};

// Export chain ID for reference
export const CHAIN_ID = CHAIN_CONFIG.chain.id;
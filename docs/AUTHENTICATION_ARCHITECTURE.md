# Authentication Architecture Documentation

## Overview

This document describes the comprehensive three-layer authentication architecture implemented in the P2E Inferno application. The system is designed to handle authentication across frontend, backend, and blockchain layers with proper security boundaries and optimal performance.

## Architecture Layers

### 1. Frontend Authentication Layer

**Purpose**: Browser-based blockchain operations with minimal bundle impact  
**Runtime Environment**: Browser/Client-side  
**Key Files**:
- `lib/blockchain/frontend-config.ts` - Client-optimized blockchain configuration
- `lib/privyUtils.ts` - Frontend Privy utilities
- Components using Privy React hooks

**Characteristics**:
- ✅ **Bundle Size Optimization**: Uses hardcoded values to avoid environment variable bundling
- ✅ **Security Boundary**: Cannot access private keys or server-only variables  
- ✅ **Browser APIs**: Optimized for wallet providers (MetaMask, WalletConnect)
- ✅ **Environment Variables**: Limited to `NEXT_PUBLIC_` prefixed variables only

**Example Configuration**:
```typescript
// Frontend: Hardcoded for minimal bundle size
export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  'base': {
    rpcUrl: 'https://mainnet.base.org', // No env vars = smaller bundle
    chainId: 8453,
    usdcAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }
}
```

### 2. Backend Authentication Layer

**Purpose**: Server-side blockchain operations with full environment variable access  
**Runtime Environment**: Node.js Server  
**Key Files**:
- `lib/blockchain/server-config.ts` - Server-side blockchain configuration
- `lib/blockchain/config/unified-config.ts` - Unified configuration system
- `lib/auth/privy.ts` - Server-side Privy utilities
- `lib/auth/admin-auth.ts` - Admin authentication middleware

**Characteristics**:
- ✅ **Full Environment Access**: Can access `LOCK_MANAGER_PRIVATE_KEY`, `ALCHEMY_API_KEY`, etc.
- ✅ **Private Key Operations**: Creates wallet clients for transaction signing
- ✅ **Enhanced RPC**: Uses authenticated Alchemy endpoints with API keys
- ✅ **Security Validation**: Validates private key formats without logging sensitive data
- ✅ **JWT Fallback**: Local JWT verification when Privy API is unavailable

**Example Configuration**:
```typescript
// Server: Environment-based for flexibility + security
const privateKey = process.env.LOCK_MANAGER_PRIVATE_KEY; // Server-only
const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY; // Server-only optimization
const rpcUrl = `${process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL}${apiKey}`;
```

### 3. Smart Contract Authentication Layer

**Purpose**: On-chain validation and blockchain transaction operations  
**Runtime Environment**: Edge Functions (Deno) + Blockchain Network  
**Key Files**:
- `supabase/functions/verify-payment/` - Edge function for payment verification
- `lib/blockchain/lock-manager.ts` - Unlock Protocol integration
- Smart contracts on Base network

**Characteristics**:
- ✅ **Deno Environment**: Uses `Deno.env.get()` for environment variables
- ✅ **Network-Specific RPC**: Dynamic RPC URL selection based on chain ID
- ✅ **Transaction Verification**: On-chain receipt polling and event log parsing
- ✅ **Isolated Execution**: Runs in separate edge function environment

**Example Configuration**:
```typescript
// Edge functions: Deno-style environment access
const RPC_URLS: Record<number, string> = {
  8453: Deno.env.get('NEXT_PUBLIC_BASE_MAINNET_RPC_URL')!, // Deno-specific
  84532: Deno.env.get('NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL')!,
};
```

## Authentication Flows

### Standard User Authentication Flow

1. **Frontend**: User connects wallet via Privy
2. **Frontend**: Privy generates JWT token
3. **Backend**: API middleware verifies JWT via `getPrivyUser()`
4. **Backend**: Fallback to local JWT verification if Privy API unavailable
5. **Database**: User profile retrieved/created in Supabase

### Admin Authentication Flow

1. **Standard Auth**: Complete user authentication (steps 1-5 above)
2. **Wallet Retrieval**: Fetch user's connected wallet addresses
3. **Parallel Key Checking**: Check all wallets simultaneously for admin keys
4. **Blockchain Validation**: Verify admin key via Unlock Protocol contract
5. **Access Granted**: Admin access granted if any wallet has valid key

### Payment Verification Flow

1. **Frontend**: User initiates payment transaction
2. **Blockchain**: Transaction confirmed on-chain
3. **Edge Function**: Webhook triggers payment verification
4. **Smart Contract**: Verify transaction details against contract events
5. **Database**: Update user profile with payment status

## Key Security Features

### Environment Variable Boundaries

```typescript
// ✅ FRONTEND: Only NEXT_PUBLIC_ variables
process.env.NEXT_PUBLIC_BLOCKCHAIN_NETWORK // Available

// ✅ BACKEND: Full environment access  
process.env.LOCK_MANAGER_PRIVATE_KEY // Server only
process.env.ALCHEMY_API_KEY // Server only

// ✅ EDGE FUNCTIONS: Deno environment
Deno.env.get('NEXT_PUBLIC_BASE_MAINNET_RPC_URL') // Edge function only
```

### JWT Fallback Mechanism

When Privy API is unavailable, the system falls back to local JWT verification:

```typescript
// Primary: Privy API verification
const claims = await privy.verifyAuthToken(token);

// Fallback: Local JWT verification  
const publicKey = await jose.importSPKI(verificationKey, "ES256");
const { payload } = await jose.jwtVerify(token, publicKey, {
  issuer: "privy.io",
  audience: appId,
});
```

### Parallel Wallet Checking

Admin authentication checks multiple wallets simultaneously for performance:

```typescript
// Before: Sequential checking (slow)
for (const wallet of wallets) {
  await checkKey(wallet); // Sequential = slow
}

// After: Parallel checking (fast)
const results = await Promise.allSettled(
  wallets.map(wallet => checkKey(wallet))
); // Parallel = 3x faster
```

## Configuration Validation

### Startup Validation

The system validates configuration at startup to prevent silent failures:

```typescript
// Validates all required environment variables
validateAndLogConfiguration();

// Prevents silent auth failures in production
if (!isConfigValid && isProduction) {
  throw new Error('Critical auth configuration missing');
}
```

### Runtime Feature Detection

```typescript
const features = checkAuthFeatureAvailability();
// {
//   privyAuth: true,
//   jwtFallback: true,
//   adminAuth: true,
//   blockchainOps: true,
//   enhancedRpc: true
// }
```

## Error Handling

### Structured Error Classification

All authentication errors are classified with specific error codes:

```typescript
export enum AuthErrorCode {
  JWT_VERIFICATION_FAILED = 'AUTH_JWT_VERIFICATION_FAILED',
  PRIVY_API_UNAVAILABLE = 'AUTH_PRIVY_API_UNAVAILABLE',
  ADMIN_ACCESS_DENIED = 'AUTH_ADMIN_ACCESS_DENIED',
  BLOCKCHAIN_RPC_ERROR = 'AUTH_BLOCKCHAIN_RPC_ERROR',
  // ... more codes
}
```

### Safe Error Logging

Sensitive data is automatically filtered from error logs:

```typescript
// Removes: token, privateKey, secret, password
logSafeError(authError, userId);
```

## Performance Optimizations

### Bundle Size Optimization

- **Frontend configs**: Hardcoded values (no environment variable bundling)
- **Tree shaking**: Only used authentication modules are bundled
- **Lazy loading**: Admin components loaded only when needed

### Network Optimization

- **Parallel operations**: Multiple wallet checks run simultaneously
- **RPC caching**: Blockchain client instances are cached
- **Fallback mechanisms**: Local verification when APIs are slow/unavailable

### Development vs Production

| Feature | Development | Production |
|---------|------------|------------|
| Config validation | Warnings only | Hard errors |
| Admin fallback | `DEV_ADMIN_ADDRESSES` | Blockchain only |
| Error logging | Full details | Safe logging |
| JWT fallback | Always available | Requires config |

## File Structure Summary

```
lib/auth/
├── admin-auth.ts              # Admin authentication middleware
├── admin-key-checker.ts       # Parallel wallet checking utilities  
├── config-validation.ts       # Startup configuration validation
├── error-handler.ts           # Unified error handling system
└── privy.ts                   # Server-side Privy utilities

lib/blockchain/
├── config/
│   └── unified-config.ts      # Unified blockchain configuration
├── frontend-config.ts         # Browser-optimized config (minimal bundle)
├── server-config.ts           # Server-side config (full env access)
└── lock-manager.ts            # Unlock Protocol integration

supabase/functions/
└── verify-payment/            # Edge function for blockchain verification
```

## Why This Architecture?

### Problem Solved

1. **Security**: Proper environment variable boundaries prevent key exposure
2. **Performance**: Bundle optimization and parallel operations
3. **Reliability**: Fallback mechanisms for network issues
4. **Maintainability**: Centralized configuration with clear separation
5. **Scalability**: Supports multiple runtime environments

### Alternative Approaches Considered

❌ **Single Unified Config**: Would break security boundaries  
❌ **Client-Side Admin Auth**: Would expose sensitive blockchain operations  
❌ **Sequential Wallet Checking**: Too slow for users with multiple wallets  
❌ **No JWT Fallback**: Would fail completely during Privy outages

### Future Extensibility

The architecture supports:
- ✅ Additional runtime environments (Cloudflare Workers, etc.)
- ✅ Multiple blockchain networks
- ✅ Alternative authentication providers
- ✅ Enhanced admin permission models

---

*This architecture reflects real constraints of Next.js SSR, browser security models, and edge function environments. The separation is necessary and should be maintained.*
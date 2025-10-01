# Ethers-Viem Adapter Implementation

## Overview
Created an ethers-based client adapter that provides a viem-compatible interface for blockchain contract reads. This allows using ethers.js under the hood while maintaining the same API surface as viem's `PublicClient`.

## Implementation

### Core Files Created

#### 1. `lib/blockchain/config/clients/ethers-alchemy-adapter.ts`
- **Purpose**: Ethers-based client with viem-compatible `readContract()` interface
- **Features**:
  - Singleton caching for performance
  - Uses default ethers settings (no custom timeout/retries)
  - Mirrors Alchemy-only RPC URL resolution with public RPC fallback
  - Integrates with existing blockchain logger

**Key Interface**:
```typescript
interface ReadContractParameters {
  address: string;
  abi: any[];
  functionName: string;
  args?: readonly unknown[];
}

class EthersViemAdapter {
  async readContract<T = any>(params: ReadContractParameters): Promise<T>
}
```

**Export Function**:
```typescript
export const createAlchemyEthersAdapterReadClient = (): EthersViemAdapter
```

### RPC URL Resolution Strategy

The adapter mirrors the existing `createAlchemyPublicClient` approach:

1. Get chain from `resolveChain()`
2. Get Alchemy base URL for chain ID
3. Call `createAlchemyRpcUrl(baseUrl)` which:
   - Returns Alchemy URL with API key if `NEXT_PUBLIC_ALCHEMY_API_KEY` is set
   - Falls back to public RPC if no API key:
     - Base Mainnet → `https://mainnet.base.org`
     - Base Sepolia → `https://sepolia.base.org`
     - Ethereum Mainnet → `https://cloudflare-eth.com`

### Contract Execution

```typescript
async readContract<T>(params: ReadContractParameters): Promise<T> {
  const { address, abi, functionName, args = [] } = params;
  const contract = new ethers.Contract(address, abi, this.provider);
  const result = await contract[functionName](...args);
  return result as T;
}
```

## Files Updated

### Export Configuration
1. **`lib/blockchain/config/clients/index.ts`**
   - Added export for `createAlchemyEthersAdapterReadClient`

2. **`lib/blockchain/config/index.ts`**
   - Added export for `createAlchemyEthersAdapterReadClient` in main config

### Admin Authentication Files (Migrated to Ethers Adapter)
1. **`app/api/admin/session/route.ts`**
   - Replaced `createAlchemyPublicClient` → `createAlchemyEthersAdapterReadClient`
   - All admin key checks now use ethers adapter

2. **`lib/auth/route-handlers/admin-guard.ts`**
   - Replaced all instances (4 total)
   - Admin guard now uses ethers for contract reads

3. **`lib/auth/admin-auth.ts`**
   - Replaced all instances (4 total)
   - Pages API admin auth now uses ethers adapter

4. **`pages/api/admin/session-fallback.ts`**
   - Replaced all instances (2 total)
   - Fallback session endpoint now uses ethers adapter

## Usage Comparison

### Before (Viem)
```typescript
import { createAlchemyPublicClient } from "@/lib/blockchain/config";

const client = createAlchemyPublicClient();
const hasKey = await client.readContract({
  address: adminLockAddress,
  abi: COMPLETE_LOCK_ABI,
  functionName: "getHasValidKey",
  args: [userAddress],
});
```

### After (Ethers Adapter)
```typescript
import { createAlchemyEthersAdapterReadClient } from "@/lib/blockchain/config";

const client = createAlchemyEthersAdapterReadClient();
const hasKey = await client.readContract({
  address: adminLockAddress,
  abi: COMPLETE_LOCK_ABI,
  functionName: "getHasValidKey",
  args: [userAddress],
});
```

## Benefits

1. ✅ **Drop-in Replacement**: Same interface as viem's PublicClient
2. ✅ **Type Safety**: Full TypeScript support maintained
3. ✅ **Performance**: Singleton caching for provider reuse
4. ✅ **Consistent Logging**: Uses existing blockchain logger
5. ✅ **Fallback Support**: Automatic fallback to public RPC when no API key
6. ✅ **Default Settings**: Uses ethers defaults (no custom timeout/retries)
7. ✅ **Simple Implementation**: Reuses existing `createAlchemyRpcUrl` helper

## Testing

The adapter is now used in all admin authentication flows:
- Admin session creation (App Router)
- Admin session fallback (Pages API)
- Admin guard (Route Handlers)
- Admin auth middleware (Pages API)

All contract read operations for admin key verification now use the ethers adapter.

## Future Enhancements

Potential additions to the adapter:
1. **Contract Caching**: Cache contract instances by address for better performance
2. **Multicall Support**: Add `multicall` method for batched reads
3. **Custom Chain Support**: Add `createAlchemyEthersAdapterReadClientForChain(chain)`
4. **Write Simulation**: Add `simulateContract` for transaction preview
5. **Event Queries**: Add `getLogs` for event filtering

## Migration Notes

- All admin authentication contract reads now use ethers instead of viem
- The viem client (`createAlchemyPublicClient`) is still available and can be used alongside
- Both clients share the same RPC URL resolution logic
- No breaking changes to existing code - purely additive implementation

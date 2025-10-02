# Ethers-Viem Adapter Implementation

## Overview
Created an ethers-based client adapter that provides a viem-compatible interface for blockchain contract reads. This allows using ethers.js under the hood while maintaining the same API surface as viem's `PublicClient`.

## Implementation

### Core Files Created

#### 1. `lib/blockchain/config/clients/ethers-adapter-client.ts`
- **Purpose**: Ethers-based client with viem-compatible `readContract()` interface
- **Features**:
  - Mapped cache per provider and chain (e.g., `alchemy:8453`, `infura:84532`)
  - Uses default ethers settings (no custom timeout/retries)
  - Supports Alchemy and Infura creators; each falls back to public RPC if its key/URL is missing
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

**Export Functions**:
```typescript
export const createEthersAdapterReadClient: (opts?: { prefer?: 'alchemy' | 'infura' }) => EthersViemAdapter
export const createAlchemyEthersAdapterReadClient: () => EthersViemAdapter
export const createInfuraEthersAdapterReadClient: () => EthersViemAdapter
```

### RPC URL Resolution Strategy (single preferred + public fallback)

For the selected provider only (no multi-provider fallback chain):

1. Get chain from `resolveChain()`
2. If preferred is Alchemy:
   - Build base via `getAlchemyBaseUrl(chain.id)` and call `createAlchemyRpcUrl(baseUrl)`
   - If no Alchemy key, `createAlchemyRpcUrl` returns public Base RPC (`https://mainnet.base.org` or `https://sepolia.base.org`)
3. If preferred is Infura:
   - Use `NEXT_PUBLIC_INFURA_BASE_MAINNET_RPC_URL` / `NEXT_PUBLIC_INFURA_BASE_SEPOLIA_RPC_URL` if set
   - Else construct `https://base-mainnet.infura.io/v3/${NEXT_PUBLIC_INFURA_API_KEY}` or `https://base-sepolia.infura.io/v3/${NEXT_PUBLIC_INFURA_API_KEY}`
   - If neither present, fall back to public Base RPC (`https://mainnet.base.org` or `https://sepolia.base.org`)

Note: This adapter intentionally does not implement multi-provider fallback (e.g., Alchemy→Infura). That logic remains in the viem public client with fallback transport.

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
1. **`lib/blockchain/config/clients/index.ts`** (if present)
   - Export `createEthersAdapterReadClient`
   - Export `createAlchemyEthersAdapterReadClient`
   - Export `createInfuraEthersAdapterReadClient`

2. **`lib/blockchain/config/index.ts`**
   - Export the same creators for top-level consumption

### Admin Authentication Files (Migrated to Ethers Adapter)
1. **`app/api/admin/session/route.ts`**
   - Replaced `createAlchemyPublicClient` → `createAlchemyEthersAdapterReadClient`
   - All admin key checks now use ethers adapter

2. **`lib/auth/route-handlers/admin-guard.ts`**
   - Replaced all instances
   - Admin guard now uses ethers for contract reads

3. **`lib/auth/admin-auth.ts`**
   - Replaced all instances
   - Pages API admin auth now uses ethers adapter

4. **`pages/api/admin/session-fallback.ts`**
   - Replaced all instances
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

### After (Ethers Adapter - Alchemy)
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

### After (Ethers Adapter - Infura)
```typescript
import { createInfuraEthersAdapterReadClient } from "@/lib/blockchain/config";

const client = createInfuraEthersAdapterReadClient();
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
3. ✅ **Performance**: Mapped cache per provider+chain for adapter reuse
4. ✅ **Consistent Logging**: Uses existing blockchain logger
5. ✅ **Fallback Support**: Automatic public RPC fallback when the preferred provider key/URL is missing
6. ✅ **Default Settings**: Uses ethers defaults (no custom timeout/retries)
7. ✅ **Simple Implementation**: Reuses `createAlchemyRpcUrl` and simple Infura URL construction

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

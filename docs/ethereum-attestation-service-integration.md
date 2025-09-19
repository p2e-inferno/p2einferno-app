# Ethereum Attestation Service (EAS) Integration

## Overview

This document provides comprehensive documentation for Phase 1 of the Ethereum Attestation Service (EAS) integration in P2E Inferno. The EAS system enables on-chain attestations for various user actions, starting with daily check-ins and expanding to quest completions, bootcamp attendance, and other verifiable activities.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Core Components](#core-components)
3. [Database Schema](#database-schema)
4. [API Reference](#api-reference)
5. [React Hooks](#react-hooks)
6. [UI Components](#ui-components)
7. [Utility Functions](#utility-functions)
8. [Configuration](#configuration)
9. [Testing](#testing)
10. [Usage Examples](#usage-examples)
11. [Migration Guide](#migration-guide)
12. [Troubleshooting](#troubleshooting)

## Architecture Overview

The EAS integration follows a modular architecture with clear separation of concerns:

```
lib/attestation/
├── core/           # Core service and types
├── utils/          # Utility functions
├── schemas/        # Schema management
└── database/       # Database queries

hooks/attestation/  # React hooks
components/attestation/  # UI components
```

### Key Design Principles

- **Modularity**: Each component can be used independently
- **Type Safety**: Full TypeScript coverage
- **Extensibility**: Easy to add new attestation types
- **Testability**: Comprehensive test coverage
- **Performance**: Optimized database queries and caching

## Core Components

### 1. AttestationService (`lib/attestation/core/service.ts`)

The main service class that handles all attestation operations.

```typescript
import { AttestationService } from '@/lib/attestation/core/service';

const service = new AttestationService();

// Create an attestation
const result = await service.createAttestation({
  schemaUid: '0x...',
  recipient: '0x...',
  data: { greeting: 'GM', timestamp: Date.now() },
  wallet: connectedWallet
});

// Revoke an attestation
await service.revokeAttestation({
  schemaUid: '0x...',
  attestationUid: '0x...',
  wallet: connectedWallet
});

// Get user attestations
const attestations = await service.getAttestations('0x...', '0x...');
```

**Key Methods:**
- `createAttestation(params)` - Creates a new attestation
- `revokeAttestation(params)` - Revokes an existing attestation
- `getAttestations(recipient, schemaUid?)` - Retrieves attestations
- `encodeDataForSchema(schema, data)` - Encodes data for on-chain storage

### 2. Types (`lib/attestation/core/types.ts`)

Core TypeScript interfaces and types:

```typescript
interface AttestationRequest {
  schemaUid: string;
  recipient: string;
  data: Record<string, unknown>;
  revocable?: boolean;
  expirationTime?: number;
}

interface AttestationResult {
  success: boolean;
  attestationUid?: string;
  transactionHash?: string;
  error?: string;
}

interface Attestation {
  id: string;
  attestation_uid: string;
  schema_uid: string;
  attester: string;
  recipient: string;
  data: any;
  is_revoked: boolean;
  revocation_time?: string;
  expiration_time?: string;
  created_at: string;
  updated_at: string;
}

interface AttestationSchema {
  id: string;
  schema_uid: string;
  name: string;
  description: string;
  schema_definition: string;
  category: 'attendance' | 'social' | 'verification' | 'review' | 'achievement';
  revocable: boolean;
  created_at: string;
  updated_at: string;
}
```

### 3. Configuration (`lib/attestation/core/config.ts`)

The project ships with Base Sepolia defaults baked into `EAS_CONFIG`. Update these constants if you deploy to a different network:

```typescript
export const EAS_CONFIG = {
  CONTRACT_ADDRESS: '0x4200000000000000000000000000000000000021',
  SCHEMA_REGISTRY_ADDRESS: '0x4200000000000000000000000000000000000020',
  NETWORK: 'base-sepolia',
  CHAIN_ID: 84532,
} as const;

export const P2E_SCHEMA_UIDS = {
  DAILY_CHECKIN: '0xp2e_daily_checkin_001',
  QUEST_COMPLETION: '0xp2e_quest_completion_001',
  BOOTCAMP_COMPLETION: '0xp2e_bootcamp_completion_001',
  MILESTONE_ACHIEVEMENT: '0xp2e_milestone_achievement_001',
} as const;
```

If you prefer using environment variables, wire them into this file before building.

## Database Schema

### Migration File: `supabase/migrations/062_attestation_system.sql`

The database schema includes two main tables:

#### 1. `attestation_schemas`
Stores schema definitions, metadata, and category tagging:

```sql
CREATE TABLE IF NOT EXISTS public.attestation_schemas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schema_uid TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schema_definition TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('attendance', 'social', 'verification', 'review', 'achievement')),
  revocable BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
```

#### 2. `attestations`
Persists each minted attestation and its lifecycle metadata:

```sql
CREATE TABLE IF NOT EXISTS public.attestations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attestation_uid TEXT NOT NULL UNIQUE,
  schema_uid TEXT NOT NULL REFERENCES public.attestation_schemas(schema_uid),
  attester TEXT NOT NULL,
  recipient TEXT NOT NULL,
  data JSONB NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT false,
  revocation_time TIMESTAMP WITH TIME ZONE,
  expiration_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_attester_address CHECK (length(attester) = 42),
  CONSTRAINT valid_recipient_address CHECK (length(recipient) = 42)
);
```

The migration adds indexes on the frequently queried columns (`schema_uid`, `recipient`, `attester`, timestamps), enables RLS with read for everyone and write for authenticated users, and wires triggers to keep `updated_at` current.

Default P2E schema rows for daily check-ins, quest completion, bootcamp completion, and milestone achievements are inserted idempotently.

### Helper Functions

Utility functions shipped with the migration:

- `get_user_checkin_streak(user_address TEXT)` – counts consecutive daily check-ins, anchored to today
- `has_checked_in_today(user_address TEXT)` – quick helper to gate UI when a user already checked in

## API Reference

### Schema Management (`lib/attestation/schemas/registry.ts`)

```typescript
import {
  registerSchema,
  getAllSchemas,
  getSchemaByUid,
  updateSchema,
  deleteSchema,
  getSchemasByCategory
} from '@/lib/attestation/schemas/registry';

// Register a new schema
const result = await registerSchema({
  schema_uid: '0x...',
  name: 'Daily Checkin',
  description: 'Daily user check-in attestation',
  schema_definition: 'address walletAddress,string greeting,uint256 timestamp',
  category: 'attendance',
  revocable: false
});

// Get all schemas
const schemas = await getAllSchemas();

// Get schemas by category
const attendanceSchemas = await getSchemasByCategory('attendance');
```

### Database Queries (`lib/attestation/database/queries.ts`)

```typescript
import {
  getUserAttestations,
  getAttestationsBySchema,
  getAttestationByUid,
  hasUserAttestation,
  getUserDailyCheckinStreak,
  getUserAttestationCount,
  getRecentAttestations,
  getSchemaStatistics
} from '@/lib/attestation/database/queries';

// Get user's attestations
const userAttestations = await getUserAttestations('0x...', {
  schemaUid: '0x...',
  limit: 10,
  offset: 0
});

// Check if user has specific attestation
const hasAttestation = await hasUserAttestation('0x...', '0x...');

// Get daily check-in streak
const streak = await getUserDailyCheckinStreak('0x...');

// Get schema statistics
const stats = await getSchemaStatistics('0x...');
// Returns: { totalCount, uniqueUsers, todayCount, thisWeekCount }
```

## React Hooks

### 1. `useAttestations` (`hooks/attestation/useAttestations.ts`)

Provides the imperative helpers for minting, revoking, and querying the current wallet’s attestations. The hook manages loading state internally.

```typescript
import { useAttestations } from '@/hooks/attestation';

function CreateButton() {
  const { createAttestation, isLoading } = useAttestations();

  return (
    <button
      disabled={isLoading}
      onClick={() =>
        createAttestation({
          schemaUid: P2E_SCHEMA_UIDS.DAILY_CHECKIN,
          recipient: user.wallet.address,
          data: {
            walletAddress: user.wallet.address,
            greeting: 'GM',
            timestamp: Date.now(),
          },
        })
      }
    >
      {isLoading ? 'Creating…' : 'Create Attestation'}
    </button>
  );
}
```

Returned values: `{ createAttestation, revokeAttestation, getUserAttestations, isLoading }`.

### 2. Schema Hooks (`hooks/attestation/useAttestationSchemas.ts`)

`useAttestationSchemas` loads all schemas (optionally filtered by category) and exposes `{ schemas, isLoading, error, refetch }`. A companion `useAttestationSchema(schemaUid)` fetches a single schema.

```typescript
const { schemas, isLoading, error, refetch } = useAttestationSchemas('attendance');

useEffect(() => {
  if (!isLoading && schemas.length === 0) {
    refetch();
  }
}, [isLoading, schemas, refetch]);
```

### 3. Query Hooks (`hooks/attestation/useAttestationQueries.ts`)

This module exposes specialised hooks for read-only views:

- `useUserAttestations(address?, options?)` → lists attestations for a wallet and returns `{ attestations, isLoading, error, refetch }`
- `useSchemaAttestations(schemaUid, limit?)` → fetches the most recent attestations for a schema
- `useUserAttestationStats(address?)` → aggregates totals, streak, and today’s check-in flag
- `useSchemaStats(schemaUid)` → aggregates per-schema statistics

Each hook manages its own loading/error state and supports manual refresh through the returned `refetch` function.

## UI Components

### 1. AttestationButton (`components/attestation/AttestationButton.tsx`)

Reusable button component for creating attestations:

```typescript
import { AttestationButton } from '@/components/attestation';

<AttestationButton
  schemaUid={P2E_SCHEMA_UIDS.DAILY_CHECKIN}
  recipient={user.wallet.address}
  data={{
    walletAddress: user.wallet.address,
    greeting: 'GM',
    timestamp: Date.now(),
    userDid: user.id,
    xpGained: 10,
  }}
  onSuccess={(result) => {
    console.log('Success:', result.attestationUid);
  }}
  onError={(message) => {
    console.error('Failed:', message);
  }}
>
  Daily Check-in
</AttestationButton>
```

### 2. AttestationCard (`components/attestation/AttestationCard.tsx`)

Component for displaying attestation details:

```typescript
import { AttestationCard } from '@/components/attestation';

<AttestationCard 
  attestation={attestation} 
  showActions={true} 
/>
```

### 3. AttestationList (`components/attestation/AttestationList.tsx`)

Component for displaying lists of attestations:

```typescript
import { AttestationList } from '@/components/attestation';

<AttestationList 
  attestations={attestations}
  emptyMessage="No attestations found"
/>
```

### 4. Status Components

```typescript
import { AttestationStatus, AttestationBadge } from '@/components/attestation';

<AttestationStatus isRevoked={false} isExpired={false} />
<AttestationBadge category="attendance" />
```

## Utility Functions

### 1. Encoder (`lib/attestation/utils/encoder.ts`)

Functions for encoding/decoding attestation data:

```typescript
import { 
  encodeAttestationData, 
  decodeAttestationData 
} from '@/lib/attestation/utils/encoder';

// Encode data for on-chain storage
const encoded = encodeAttestationData(
  'address walletAddress,string greeting,uint256 timestamp',
  {
    walletAddress: '0x...',
    greeting: 'GM',
    timestamp: 1234567890
  }
);

// Decode data from on-chain storage
const decoded = decodeAttestationData(
  'address walletAddress,string greeting,uint256 timestamp',
  '0x...'
);
```

### 2. Validator (`lib/attestation/utils/validator.ts`)

Functions for validating attestation data:

```typescript
import {
  isValidAddress,
  isValidSchemaDefinition,
  validateAttestationData,
  validateWalletConnection
} from '@/lib/attestation/utils/validator';

// Validate Ethereum address
const isValid = isValidAddress('0x...');

// Validate schema definition
const isValidSchema = isValidSchemaDefinition('address user,string name');

// Validate attestation data
const validation = validateAttestationData(schema, data);
if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
}

// Validate wallet connection
const walletValidation = validateWalletConnection(wallet);
```

### 3. Helpers (`lib/attestation/utils/helpers.ts`)

General utility functions:

```typescript
import {
  generateTempAttestationId,
  formatAttestationError,
  isAttestationExpired,
  getTimeUntilExpiration,
  formatAttestationDataForDisplay,
  getAttestationCategoryColor,
  truncateAttestationUid,
  parseSchemaDefinition
} from '@/lib/attestation/utils/helpers';

// Generate temporary ID
const tempId = generateTempAttestationId();

// Format error messages
const errorMessage = formatAttestationError(error);

// Check expiration
const isExpired = isAttestationExpired(expirationDate);

// Get time until expiration
const timeLeft = getTimeUntilExpiration(expirationDate);

// Format data for display
const displayData = formatAttestationDataForDisplay(attestationData);

// Get category color
const colorClass = getAttestationCategoryColor('attendance');

// Truncate UID for display
const shortUid = truncateAttestationUid('0x...');

// Parse schema definition
const fields = parseSchemaDefinition('address user,string name');
```

## Configuration

### Environment & Network Configuration

By default the integration targets Base Sepolia via the constants in `EAS_CONFIG`. If you deploy elsewhere, update the values in `lib/attestation/core/config.ts` (or pipe environment variables into that module) so the service and hooks pick up the correct contract addresses.

## Testing

### Running Tests

```bash
# Run all attestation tests
npm test -- __tests__/unit/lib/attestation/

# Run specific test files
npm test -- __tests__/unit/lib/attestation/utils/encoder.test.ts
npm test -- __tests__/unit/lib/attestation/core/service.test.ts
```

### Test Coverage

Unit tests currently target the foundational layers inside `__tests__/unit/lib/attestation/`:
- ✅ Utility functions (encoder, validator, helpers)
- ✅ Core service behaviour (`AttestationService`)
- ✅ Schema registry helpers
- ✅ Database query utilities

Hook and component coverage is planned but not yet implemented.

### Mock System

Tests use comprehensive mocks for:
- `ethers` - Blockchain interactions
- `@ethereum-attestation-service/eas-sdk` - EAS SDK
- `@/lib/supabase` - Database operations

## Usage Examples

### 1. Daily Check-in Implementation

```typescript
import { AttestationButton } from '@/components/attestation';
import { P2E_SCHEMA_UIDS } from '@/lib/attestation/core/config';
import { useUserAttestationStats } from '@/hooks/attestation/useAttestationQueries';

function DailyCheckin() {
  const { stats, refetch } = useUserAttestationStats(user.wallet.address);

  const handleCheckin = async () => {
    await refetch();
    toast.success('Daily check-in complete!');
  };

  return (
    <div>
      <h2>Daily Check-in</h2>
      <p>Current streak: {stats.dailyCheckinStreak} days</p>

      <AttestationButton
        schemaUid={P2E_SCHEMA_UIDS.DAILY_CHECKIN}
        recipient={user.wallet.address}
        data={{
          walletAddress: user.wallet.address,
          greeting: 'GM',
          timestamp: Date.now(),
          userDid: user.id,
          xpGained: 10,
        }}
        onSuccess={handleCheckin}
      >
        Check In
      </AttestationButton>
    </div>
  );
}
```

### 2. Quest Completion

```typescript
function QuestCompletion({ questId, questName }) {
  return (
    <AttestationButton
      schemaUid={P2E_SCHEMA_UIDS.QUEST_COMPLETION}
      recipient={user.wallet.address}
      data={{
        questId,
        questTitle: questName,
        userAddress: user.wallet.address,
        completionDate: Date.now(),
        xpEarned: 100,
        difficulty: 'medium',
      }}
      onSuccess={() => {
        // Update quest status
        // Award XP
        // Show completion animation
      }}
    />
  );
}
```

### 3. Bootcamp Attendance

```typescript
function BootcampAttendance({ bootcampId, sessionId }) {
  return (
    <AttestationButton
      schemaUid={P2E_SCHEMA_UIDS.BOOTCAMP_COMPLETION}
      recipient={user.wallet.address}
      data={{
        bootcampId,
        bootcampTitle: currentBootcamp.title,
        userAddress: user.wallet.address,
        completionDate: Date.now(),
        totalXpEarned: 350,
        certificateHash: certificateIpfsHash,
      }}
    />
  );
}
```

## Migration Guide

### 1. Database Migration

Run the migration to create the attestation tables:

```bash
# Using Supabase CLI
supabase db reset

# Or using npm script
npm run db:migrate
```

### 2. Install Dependencies

Ensure the EAS SDK is available in your project:

```bash
npm install @ethereum-attestation-service/eas-sdk
```

### 3. Update Configuration

1. Update contract addresses in `lib/attestation/core/config.ts` (or wire your own env variables there)
2. Register schemas using the schema management functions

### 4. Register Default Schemas

```typescript
import { registerSchema } from '@/lib/attestation/schemas/registry';

// Register daily check-in schema
await registerSchema({
  schema_uid: P2E_SCHEMA_UIDS.DAILY_CHECKIN,
  name: 'Daily Check-in',
  description: 'Daily user check-in attestation',
  schema_definition: 'address walletAddress,string greeting,uint256 timestamp,string userDid,uint256 xpGained',
  category: 'attendance',
  revocable: false
});
```

## Troubleshooting

### Common Issues

#### 1. "Wallet not connected" Error

```typescript
// Ensure wallet is properly connected
const { wallet } = usePrivy();
if (!wallet) {
  return <div>Please connect your wallet</div>;
}
```

#### 2. "Schema not found" Error

```typescript
// Ensure schema is registered
const schema = await getSchemaByUid(schemaUid);
if (!schema) {
  console.error('Schema not found:', schemaUid);
  // Register schema or use correct UID
}
```

#### 3. "Invalid schema definition" Error

```typescript
// Validate schema definition format
const isValid = isValidSchemaDefinition('address user,string name');
if (!isValid) {
  console.error('Invalid schema definition');
}
```

#### 4. Database Connection Issues

```typescript
// Check Supabase connection
const { data, error } = await supabase
  .from('attestation_schemas')
  .select('*')
  .limit(1);

if (error) {
  console.error('Database connection error:', error);
}
```

### Debug Mode

Enable debug logging by setting environment variables:

```bash
LOG_LEVEL=debug
NEXT_PUBLIC_LOG_LEVEL=debug
```

### Performance Optimization

1. **Use pagination** for large attestation lists
2. **Cache schema definitions** to avoid repeated database calls
3. **Batch operations** when creating multiple attestations
4. **Use indexes** on frequently queried columns

## File Reference

### Core Files
- `lib/attestation/core/service.ts` - Main service class
- `lib/attestation/core/types.ts` - TypeScript interfaces
- `lib/attestation/core/config.ts` - Configuration constants
- `lib/attestation/index.ts` - Main export file

### Utility Files
- `lib/attestation/utils/encoder.ts` - Data encoding/decoding
- `lib/attestation/utils/validator.ts` - Data validation
- `lib/attestation/utils/helpers.ts` - General utilities

### Schema Management
- `lib/attestation/schemas/registry.ts` - Schema CRUD operations
- `lib/attestation/schemas/definitions.ts` - Default schemas

### Database
- `lib/attestation/database/queries.ts` - Database query functions
- `supabase/migrations/062_attestation_system.sql` - Database schema

### React Hooks
- `hooks/attestation/useAttestations.ts` - Main attestation hook
- `hooks/attestation/useAttestationSchemas.ts` - Schema management hook
- `hooks/attestation/useAttestationQueries.ts` - Query hook

### UI Components
- `components/attestation/AttestationButton.tsx` - Action button
- `components/attestation/AttestationCard.tsx` - Display card
- `components/attestation/AttestationList.tsx` - List component
- `components/attestation/ui/AttestationStatus.tsx` - Status badge
- `components/attestation/ui/AttestationBadge.tsx` - Generic badge

### Tests
- `__tests__/unit/lib/attestation/utils/` - Utility function tests
- `__tests__/unit/lib/attestation/core/` - Core service tests
- `__tests__/unit/lib/attestation/schemas/` - Schema management tests
- `__tests__/unit/lib/attestation/database/` - Database query tests
- `__mocks__/ethers.js` - Ethers mock for testing

## Support

For questions or issues with the EAS integration:

1. Check the troubleshooting section above
2. Review the test files for usage examples
3. Check the existing codebase for similar patterns
4. Refer to the [EAS documentation](https://docs.attest.sh/) for blockchain-specific questions

---

**Last Updated**: December 2024  
**Version**: Phase 1 - Foundation  
**Status**: Production Ready

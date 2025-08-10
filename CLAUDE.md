# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev        # Start development server on http://localhost:3000
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint, Prettier check, and TypeScript type checking
npm run format     # Format code with Prettier
```

## Architecture Overview

This is a Next.js application with Pages Router that implements a Play-to-Earn (P2E) gamified education platform for Web3/blockchain learning.

### Tech Stack
- **Frontend**: Next.js (Pages Router), TypeScript, React
- **Styling**: Tailwind CSS with custom dark theme
- **Authentication**: Multi-layer authentication system (Frontend, Backend, Blockchain)
- **Database**: Supabase (PostgreSQL with Row-Level Security)
- **State**: React hooks, no global state management library
- **HTTP**: Axios with custom API client setup
- **Blockchain**: Unlock Protocol for access control, Alchemy RPC, Base network
- **Token-gating**: Admin authentication via blockchain key validation

### Multi-Layer Authentication Architecture

This application implements a sophisticated **three-layer authentication system** designed for security, performance, and scalability:

#### 1. Frontend Authentication Layer
- **Files**: `lib/blockchain/frontend-config.ts`, `lib/privyUtils.ts`
- **Purpose**: Browser-based authentication with minimal bundle impact
- **Characteristics**: 
  - Hardcoded blockchain configurations (no env var bundling)
  - Privy React hooks for wallet connection
  - Security boundary: Cannot access private keys
  - Only `NEXT_PUBLIC_` environment variables accessible

#### 2. Backend Authentication Layer  
- **Files**: `lib/auth/privy.ts`, `lib/auth/admin-auth.ts`, `lib/blockchain/server-config.ts`
- **Purpose**: Server-side authentication with full environment access
- **Characteristics**:
  - Full environment variable access (private keys, API keys)
  - JWT verification with Privy API fallback mechanism
  - Parallel wallet checking for admin authentication (3x performance improvement)
  - Enhanced RPC via authenticated Alchemy endpoints
  - Structured error handling with security boundaries

#### 3. Blockchain Authentication Layer
- **Files**: `lib/blockchain/lock-manager.ts`, Supabase Edge Functions
- **Purpose**: On-chain validation and smart contract operations
- **Characteristics**:
  - Unlock Protocol integration for admin key validation
  - Payment verification via blockchain transaction monitoring
  - Edge function environment (Deno runtime)
  - Network-specific RPC configuration

### Key Authentication Files

**Core Authentication**:
- `lib/auth/admin-auth.ts` - Blockchain-only admin authentication middleware
- `lib/auth/privy.ts` - Server-side Privy utilities with JWT fallback
- `lib/auth/config-validation.ts` - Startup configuration validation
- `lib/auth/error-handler.ts` - Structured error handling system
- `lib/auth/admin-key-checker.ts` - Parallel wallet checking utilities

**Blockchain Configuration**:
- `lib/blockchain/config/unified-config.ts` - Centralized blockchain configuration
- `lib/blockchain/server-config.ts` - Server-side blockchain clients
- `lib/blockchain/frontend-config.ts` - Bundle-optimized frontend config
- `lib/blockchain/lock-manager.ts` - Unlock Protocol integration

**Why This Architecture?**
- **Security**: Proper environment variable boundaries prevent key exposure
- **Performance**: Bundle optimization, parallel operations, client caching
- **Reliability**: JWT fallback mechanisms for network issues
- **Maintainability**: Centralized configuration with clear separation
- **Scalability**: Supports multiple runtime environments

### Key Patterns

1. **API Structure**: All API endpoints follow `/pages/api/[resource]/[action].ts` pattern with standardized `ApiResponse<T>` type:
   ```typescript
   type ApiResponse<T> = {
     success: boolean;
     data?: T;
     error?: string;
   }
   ```

2. **Database Access**: Use Supabase client from `lib/supabase/client.ts`. 

3. **Type System**: 
   - **Manual Types**: `lib/supabase/types.ts` - Business logic interfaces (BootcampProgram, Cohort, etc.)
   - **Auto-Generated Types**: `lib/supabase/types-gen.ts` - Complete database schema types from Supabase
   - **Regenerate database types**: `source .env.local && npx supabase gen types typescript --linked > lib/supabase/types-gen.ts`
   - **NEVER** create `types.ts` in project root - use the lib/supabase/ directory

4. **Authentication**: Privy wrapper prevents SSR issues. Check authentication state with Privy hooks.

5. **Component Organization**: 
   - UI components in `/components/ui/` follow shadcn/ui patterns
   - Feature components grouped by feature (e.g., `/components/quests/`)
   - Layout components in `/components/layouts/`

6. **Custom Hooks**: API calls use `useApiCall` hook for consistent error handling and loading states.

### Environment Variables

**Critical for Authentication**:
- `NEXT_PUBLIC_PRIVY_APP_ID` - Privy app identifier (frontend accessible)
- `NEXT_PRIVY_APP_SECRET` - Privy server-side secret (server-only)
- `PRIVY_VERIFICATION_KEY` - JWT verification public key in SPKI format (server-only)

**Database Configuration**:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key  
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-only)

**Blockchain Configuration**:
- `NEXT_PUBLIC_BLOCKCHAIN_NETWORK` - Network selection (base/base-sepolia)
- `NEXT_PUBLIC_ADMIN_LOCK_ADDRESS` - Admin access control contract address
- `LOCK_MANAGER_PRIVATE_KEY` - Private key for blockchain operations (server-only)
- `NEXT_ALCHEMY_API_KEY` - Alchemy RPC API key (server-only)
- `BASE_MAINNET_RPC_URL` - Base mainnet RPC endpoint
- `BASE_SEPOLIA_RPC_URL` - Base sepolia testnet RPC endpoint

**Development Configuration**:
- `DEV_ADMIN_ADDRESSES` - Comma-separated admin addresses for local development
- `NEXT_PUBLIC_ENABLE_WEB3_MOCK` - Enable mock mode for testing

**Important**: The system validates these configurations at startup via `lib/auth/config-validation.ts`. Missing critical variables will cause startup failures in production.

### Database Schema
Main tables include:
- `profiles`: User profiles with XP, levels, and Web3 identities
- `quests`: Gamified tasks with metadata
- `quest_tasks`: Individual tasks within quests
- `applications`: Bootcamp applications
- `enrollments`: Course enrollments
- `cohorts`: Bootcamp cohorts

All tables use Row-Level Security (RLS) policies for authorization.

## Authentication Implementation Guidelines

### Working with the Multi-Layer Auth System

**Always use the appropriate authentication layer for your use case**:

1. **Frontend Components**: Use Privy React hooks (`usePrivy`, `useLogin`) for wallet connections
   ```typescript
   import { usePrivy } from '@privy-io/react-auth';
   const { login, authenticated, user } = usePrivy();
   ```

2. **API Routes**: Use `getPrivyUser()` for server-side authentication  
   ```typescript
   import { getPrivyUser } from '@/lib/auth/privy';
   const user = await getPrivyUser(req); // Includes JWT fallback
   ```

3. **Admin API Routes**: Use `withAdminAuth()` middleware for admin-only endpoints
   ```typescript
   import { withAdminAuth } from '@/lib/auth/admin-auth';
   export default withAdminAuth(async (req, res) => {
     // Admin-only logic here - automatically validated via blockchain
   });
   ```

**Configuration Validation**:
- Call `validateAndLogConfiguration()` at app startup to catch config issues early
- Use `checkAuthFeatureAvailability()` to detect available auth features at runtime

**Error Handling**:
- Use `handleAuthError()` for structured authentication error handling
- Implement `createErrorResponse()` for consistent HTTP error responses
- All authentication errors are automatically classified and logged safely

### Blockchain Integration Patterns

**For Frontend**: Use `lib/blockchain/frontend-config.ts` with hardcoded values
**For Server**: Use `lib/blockchain/config/unified-config.ts` with full environment access  
**For Edge Functions**: Use Deno environment with `Deno.env.get()`

**Never mix configuration layers** - each serves specific runtime constraints and security boundaries.

## Feature Implementation and Integrations

- Always begin new feature implementations and integrations by searching the codebase for existing hooks, helper functions, utilities, and components that can be reused to avoid duplication.
- **Authentication-first approach**: Consider which authentication layer your feature operates in and use appropriate utilities
- Start by creating the relevant helper functions, hooks, utilities, and components before creating the feature, page, component or integration and use the components created to keep code modular.
- Prioritize modularity and composability to ensure code is manageable and easy to maintain.
- Use abstraction as much as possible to keep scripts, apis, components lean and clean.
- Follow best practices and industry standards when creating helpers, hooks, utilities and place then in the appropriate folders do not create random folders.
- **Performance considerations**: Use parallel operations where possible (see `admin-key-checker.ts` for examples)
- **Security considerations**: Always validate configurations and use structured error handling
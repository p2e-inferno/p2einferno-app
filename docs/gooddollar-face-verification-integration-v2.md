# GoodDollar Face Verification Integration Guide (Corrected)

## Overview

GoodDollar uses facial verification as a core component of its **sybil resistance strategy** to ensure that each user is a unique, live individual. This prevents duplicate accounts and ensures the "one person, one UBI" principle for claiming Universal Basic Income (UBI).

This guide covers integration with **@goodsdks/citizen-sdk** (the official GoodDollar SDK) using **Viem/Wagmi**, which aligns with your project's tech stack.

## Key Features

### 1. **Uniqueness & Liveness Verification**
- Verifies that each user is a unique and live individual
- Prevents multiple registrations by the same person
- Uses **FaceTec's ZoOm® 3D technology** (certified for presentation attack detection)
- Resistant to spoofing via 2D photos, videos, or 3D masks

### 2. **Privacy-First Approach**
- **All image data and facial details are anonymized**
- Facial data is NOT linked to:
  - Personally identifiable information
  - GoodDollar user profiles
  - Blockchain addresses
- Users retain ownership of their facial record identifier
- Data is deleted if the user deletes their account

### 3. **Periodic Re-verification**
- Facial verification expires after an `authenticationPeriod` (typically 14 days)
- Users must re-verify their face every authentication period
- Maintains continued uniqueness verification
- Allows users to create a new account if they cannot recover their wallet

### 4. **Fraud Prevention**
- Maintains an anonymized dataset of facemaps
- Each new face submission is checked against the repository
- Prevents fraud and abuse of the UBI system
- Even if database is breached, attackers cannot link faces to personal information

---

## Prerequisites & Setup

### Environment Configuration

Before implementing face verification, configure these environment variables:

```bash
# GoodDollar SDK Environment (production, staging, or development)
NEXT_PUBLIC_GOODDOLLAR_ENV=staging

# GoodDollar Callback URL (must be whitelisted in GoodDollar Developer Portal)
NEXT_PUBLIC_GOODDOLLAR_CALLBACK_URL=https://yourapp.com/gooddollar/verify-callback

# Target Network (Base, Celo, or Ethereum)
NEXT_PUBLIC_TARGET_NETWORK=base
```

### Network Support

GoodDollar IdentitySDK supports:

| Network | Environment | Chain ID | Use Case |
|---------|-------------|----------|----------|
| **Celo Mainnet** | production | 42220 | Live app on Celo |
| **Ethereum Mainnet** | production | 1 | Live app on Ethereum |
| **Base Mainnet** | production | 8453 | Live app on Base |
| **Sepolia Testnet** | staging | 11155111 | Development/testing |
| **Local/Development** | development | N/A | Local testing |

### Register Your Application

1. Register your app on GoodDollar Developer Portal
2. Whitelist your callback URL
3. Get SDK credentials (if required)
4. Note: SDK handles authentication internally - no API keys needed for basic usage

---

## Technical Implementation

### Technology Stack
- **Face Verification Provider**: FaceTec ZoOm® 3D Technology
- **SDK**: `@goodsdks/citizen-sdk` (correct package)
- **Blockchain Library**: Viem v2.31.3 + Wagmi
- **Framework**: React with TypeScript
- **Authentication**: Privy

### Installation

```bash
npm install @goodsdks/citizen-sdk
# or
yarn add @goodsdks/citizen-sdk
```

---

## Core Implementation

### 1. Initialize IdentitySDK (Server-Side)

For server-side operations (verification checks, on-chain validation):

```typescript
// lib/gooddollar/identity-sdk.ts
import { IdentitySDK } from '@goodsdks/citizen-sdk';
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:identity-sdk');

const GOODDOLLAR_ENV = (process.env.NEXT_PUBLIC_GOODDOLLAR_ENV ||
  'staging') as 'production' | 'staging' | 'development';

/**
 * Create IdentitySDK instance for server-side operations
 */
export function createIdentitySDK() {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(),
  });

  try {
    const sdk = new IdentitySDK(publicClient, walletClient, GOODDOLLAR_ENV);
    log.info('IdentitySDK initialized', { environment: GOODDOLLAR_ENV });
    return sdk;
  } catch (error) {
    log.error('Failed to initialize IdentitySDK', { error });
    throw error;
  }
}

/**
 * Check if an address is whitelisted on-chain
 * CRITICAL: Always verify on-chain, never trust client-side status alone
 */
export async function checkWhitelistStatus(address: `0x${string}`) {
  try {
    const sdk = createIdentitySDK();
    const { isWhitelisted, root } = await sdk.getWhitelistedRoot(address);

    log.info('Whitelist status checked', {
      address,
      isWhitelisted,
      root,
    });

    return { isWhitelisted, root };
  } catch (error) {
    log.error('Failed to check whitelist status', { address, error });
    throw error;
  }
}

/**
 * Get identity expiry data for re-verification scheduling
 */
export async function getIdentityExpiry(address: `0x${string}`) {
  try {
    const sdk = createIdentitySDK();
    const expiryData = await sdk.getIdentityExpiryData(address);

    log.info('Identity expiry data retrieved', {
      address,
      expiryTimestamp: expiryData.expiryTimestamp,
    });

    return expiryData;
  } catch (error) {
    log.error('Failed to get identity expiry data', { address, error });
    throw error;
  }
}
```

### 2. Initialize IdentitySDK (Client-Side)

For client-side operations (face verification flow):

```typescript
// lib/gooddollar/use-identity-sdk.ts
import { useWalletClient, usePublicClient } from 'wagmi';
import { IdentitySDK } from '@goodsdks/citizen-sdk';
import { useMemo } from 'react';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:use-identity-sdk');

const GOODDOLLAR_ENV = (process.env.NEXT_PUBLIC_GOODDOLLAR_ENV ||
  'staging') as 'production' | 'staging' | 'development';

/**
 * Hook to get IdentitySDK instance on client-side
 * Uses Wagmi providers (wallet client + public client)
 */
export function useIdentitySDK() {
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const sdk = useMemo(() => {
    if (!walletClient || !publicClient) {
      log.debug('Waiting for wallet and public clients');
      return null;
    }

    try {
      const identitySDK = new IdentitySDK(
        publicClient,
        walletClient,
        GOODDOLLAR_ENV,
      );
      log.info('IdentitySDK initialized on client', {
        environment: GOODDOLLAR_ENV,
      });
      return identitySDK;
    } catch (error) {
      log.error('Failed to initialize IdentitySDK on client', { error });
      return null;
    }
  }, [walletClient, publicClient]);

  return sdk;
}
```

### 3. Get Display Name from Privy User

Since P2E Inferno uses Privy and doesn't collect explicit first names, derive a display name:

```typescript
// lib/gooddollar/get-display-name.ts
import { User } from '@privy-io/react-auth';
import { resolveBlockchainIdentity } from '@/lib/blockchain/services/identity-resolver';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:get-display-name');

/**
 * Extract display name from Privy user object
 * Priority: ENS name > Telegram first name > Email local part > Shortened address > "User"
 *
 * This is used for UI personalization in the face verification flow.
 * The exact usage is not documented by GoodDollar, but it likely appears as
 * a greeting or welcome message during verification.
 */
export async function getDisplayName(user: User | null): Promise<string> {
  if (!user) {
    log.debug('No Privy user provided, returning default');
    return 'User';
  }

  try {
    // 1. Try to get ENS name (async version - requires RPC call)
    const primaryWallet = user.linkedAccounts.find(
      (acc) => acc.type === 'wallet',
    );
    if (primaryWallet && primaryWallet.type === 'wallet') {
      try {
        const identity = await resolveBlockchainIdentity(
          primaryWallet.address,
        );
        if (identity.displayName) {
          log.debug('Using blockchain identity', {
            displayName: identity.displayName,
          });
          return identity.displayName;
        }
      } catch (error) {
        log.debug('Blockchain identity resolution failed', { error });
      }
    }

    // 2. Try Telegram first name
    const telegramAccount = user.linkedAccounts.find(
      (acc) => acc.type === 'telegram',
    );
    if (telegramAccount && telegramAccount.type === 'telegram') {
      if (telegramAccount.firstName) {
        log.debug('Using Telegram name', {
          displayName: telegramAccount.firstName,
        });
        return telegramAccount.firstName;
      }
    }

    // 3. Try email local part
    if (user.email) {
      const emailLocal = user.email.address.split('@')[0];
      // Convert underscores/dots to spaces and capitalize
      const displayEmail = emailLocal
        .replace(/[._]/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      if (displayEmail) {
        log.debug('Using email display name', { displayName: displayEmail });
        return displayEmail;
      }
    }

    // 4. Fallback to shortened wallet address
    if (primaryWallet && primaryWallet.type === 'wallet') {
      const shortened = `${primaryWallet.address.slice(0, 6)}...${primaryWallet.address.slice(-4)}`;
      log.debug('Using shortened address', { displayName: shortened });
      return shortened;
    }

    // 5. Ultimate fallback
    log.debug('Using default display name');
    return 'User';
  } catch (error) {
    log.error('Error getting display name', { error });
    return 'User';
  }
}

/**
 * Synchronous version without ENS resolution
 * Use this for immediate UI responses (button clicks)
 */
export function getDisplayNameSync(user: User | null): string {
  if (!user) {
    return 'User';
  }

  try {
    // 1. Try Telegram first name
    const telegramAccount = user.linkedAccounts.find(
      (acc) => acc.type === 'telegram',
    );
    if (telegramAccount && telegramAccount.type === 'telegram') {
      if (telegramAccount.firstName) {
        return telegramAccount.firstName;
      }
    }

    // 2. Try email local part
    if (user.email) {
      const emailLocal = user.email.address.split('@')[0];
      const displayEmail = emailLocal
        .replace(/[._]/g, ' ')
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      if (displayEmail) {
        return displayEmail;
      }
    }

    // 3. Fallback to shortened wallet address
    const primaryWallet = user.linkedAccounts.find(
      (acc) => acc.type === 'wallet',
    );
    if (primaryWallet && primaryWallet.type === 'wallet') {
      return `${primaryWallet.address.slice(0, 6)}...${primaryWallet.address.slice(-4)}`;
    }

    return 'User';
  } catch (error) {
    log.error('Error in getDisplayNameSync', { error });
    return 'User';
  }
}
```

### 4. Generate Face Verification Link

```typescript
// lib/gooddollar/generate-fv-link.ts
import { IdentitySDK } from '@goodsdks/citizen-sdk';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:generate-fv-link');

export interface GenerateFVLinkParams {
  sdk: IdentitySDK;
  userFirstName: string;
  callbackUrl: string;
  popupMode?: boolean;
}

/**
 * Generate a face verification link
 *
 * @param sdk - IdentitySDK instance
 * @param userFirstName - Display name for UI personalization
 * @param callbackUrl - URL to redirect after verification (must be whitelisted)
 * @param popupMode - If true, opens in popup; if false, full-page redirect
 * @returns Face verification link
 */
export async function generateFVLink({
  sdk,
  userFirstName,
  callbackUrl,
  popupMode = false,
}: GenerateFVLinkParams): Promise<string> {
  try {
    const fvLink = await sdk.generateFVLink({
      firstName: userFirstName,
      callbackUrl,
      popupMode,
    });

    log.info('Face verification link generated', {
      firstName: userFirstName,
      popupMode,
      callbackUrl,
    });

    return fvLink;
  } catch (error) {
    log.error('Failed to generate FV link', {
      userFirstName,
      callbackUrl,
      error,
    });
    throw error;
  }
}
```

### 5. Handle Verification Callback (Server-Side)

This is the most critical security piece. Always verify on-chain:

```typescript
// pages/api/gooddollar/verify-callback.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getLogger } from '@/lib/utils/logger';
import { checkWhitelistStatus, getIdentityExpiry } from '@/lib/gooddollar/identity-sdk';
import { getPrivyUser } from '@/lib/auth/privy';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const log = getLogger('api:gooddollar-verify-callback');

interface VerifyCallbackResponse {
  success: boolean;
  message: string;
  data?: {
    address: string;
    isWhitelisted: boolean;
    expiryTimestamp?: number;
  };
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<VerifyCallbackResponse>,
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed',
      error: 'Only GET and POST are supported',
    });
  }

  try {
    // Extract callback parameters
    const params = req.method === 'GET' ? req.query : req.body;
    const status = params.status as string;
    const address = params.address as string;

    log.info('Face verification callback received', { status, address });

    // ✅ VALIDATION 1: Check callback status
    if (status !== 'success') {
      log.warn('Face verification failed', { status, address });
      return res.status(200).json({
        success: false,
        message: 'Face verification failed',
        error: `Verification status: ${status}`,
      });
    }

    // ✅ VALIDATION 2: Validate address format
    if (!address || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
      log.error('Invalid address format in callback', { address });
      return res.status(400).json({
        success: false,
        message: 'Invalid address format',
        error: 'Address must be a valid Ethereum address',
      });
    }

    const normalizedAddress = address.toLowerCase() as `0x${string}`;

    // ✅ VALIDATION 3: Verify user is authenticated
    const privy = await getPrivyUser(req);
    if (!privy.user) {
      log.warn('Unauthenticated callback attempt', { address });
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
        error: 'User must be authenticated',
      });
    }

    // ✅ VALIDATION 4: Verify address matches connected wallet
    const userWallet = privy.user.linkedAccounts.find(
      (acc) => acc.type === 'wallet',
    );
    if (
      !userWallet ||
      userWallet.type !== 'wallet' ||
      userWallet.address.toLowerCase() !== normalizedAddress
    ) {
      log.error('Address mismatch - potential hijacking attempt', {
        callbackAddress: normalizedAddress,
        userAddress: userWallet?.type === 'wallet' ? userWallet.address : 'N/A',
      });
      return res.status(403).json({
        success: false,
        message: 'Address mismatch',
        error:
          'The address in the callback does not match your connected wallet',
      });
    }

    // ✅ VALIDATION 5: Verify on-chain whitelist status
    // This is the MOST IMPORTANT check - don't trust client confirmation
    const { isWhitelisted, root } = await checkWhitelistStatus(normalizedAddress);

    if (!isWhitelisted) {
      log.warn('Address not whitelisted on-chain after callback', {
        address: normalizedAddress,
      });
      return res.status(200).json({
        success: false,
        message: 'Face verification not confirmed on-chain',
        error: 'Verification failed on-chain validation',
      });
    }

    // ✅ VALIDATION 6: Get expiry data for re-verification tracking
    let expiryTimestamp: number | undefined;
    try {
      const expiryData = await getIdentityExpiry(normalizedAddress);
      expiryTimestamp = expiryData.expiryTimestamp;
    } catch (error) {
      log.warn('Failed to get expiry data, continuing without it', {
        address: normalizedAddress,
        error,
      });
    }

    // ✅ UPDATE DATABASE with verification status
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate proof hash for audit trail
    const proofData = JSON.stringify({
      status,
      address: normalizedAddress,
      timestamp: new Date().toISOString(),
      root,
    });
    const proofHash = crypto.createHash('sha256').update(proofData).digest('hex');

    const { error: dbError } = await supabase
      .from('users')
      .update({
        is_face_verified: true,
        face_verified_at: new Date().toISOString(),
        gooddollar_whitelist_checked_at: new Date().toISOString(),
        face_verification_expiry: expiryTimestamp
          ? new Date(expiryTimestamp * 1000).toISOString()
          : null,
        face_verification_proof_hash: proofHash,
      })
      .eq('wallet_address', normalizedAddress);

    if (dbError) {
      log.error('Failed to update user face verification status', {
        address: normalizedAddress,
        error: dbError,
      });
      throw dbError;
    }

    log.info('Face verification completed successfully', {
      address: normalizedAddress,
      expiryTimestamp,
    });

    return res.status(200).json({
      success: true,
      message: 'Face verification completed successfully',
      data: {
        address: normalizedAddress,
        isWhitelisted: true,
        expiryTimestamp,
      },
    });
  } catch (error) {
    log.error('Unexpected error in verify callback', { error });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'An unexpected error occurred',
    });
  }
}
```

### 6. Client-Side Face Verification Component

```typescript
// components/gooddollar/FaceVerificationButton.tsx
import { usePrivy } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { useIdentitySDK } from '@/lib/gooddollar/use-identity-sdk';
import { generateFVLink } from '@/lib/gooddollar/generate-fv-link';
import { getDisplayNameSync } from '@/lib/gooddollar/get-display-name';
import { Button } from '@/components/ui/button';
import { getLogger } from '@/lib/utils/logger';
import { useState } from 'react';
import toast from 'react-hot-toast';

const log = getLogger('component:face-verification-button');

interface FaceVerificationButtonProps {
  onVerified?: () => void;
  className?: string;
}

export function FaceVerificationButton({
  onVerified,
  className,
}: FaceVerificationButtonProps) {
  const { user } = usePrivy();
  const { address } = useAccount();
  const sdk = useIdentitySDK();
  const [isLoading, setIsLoading] = useState(false);

  const handleVerify = async () => {
    try {
      if (!sdk) {
        toast.error('SDK not initialized. Please refresh and try again.');
        log.error('SDK not initialized');
        return;
      }

      if (!address) {
        toast.error('Please connect your wallet first');
        return;
      }

      setIsLoading(true);

      // Get personalized display name
      const displayName = getDisplayNameSync(user);
      log.info('Initiating face verification', {
        displayName,
        address,
      });

      // Generate FV link
      const callbackUrl = `${window.location.origin}/api/gooddollar/verify-callback`;
      const fvLink = await generateFVLink({
        sdk,
        userFirstName: displayName,
        callbackUrl,
        popupMode: false,
      });

      log.info('FV link generated, redirecting', { fvLink });
      window.location.href = fvLink;
    } catch (error) {
      log.error('Failed to initiate face verification', { error });
      toast.error('Failed to initiate face verification');
      setIsLoading(false);
    }
  };

  return (
    <Button
      onClick={handleVerify}
      disabled={isLoading || !sdk || !address}
      className={className}
    >
      {isLoading ? 'Loading...' : 'Verify Your Identity'}
    </Button>
  );
}
```

### 7. Hook to Check Verification Status

```typescript
// hooks/useGoodDollarVerification.ts
import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { useIdentitySDK } from '@/lib/gooddollar/use-identity-sdk';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hook:use-gooddollar-verification');

export interface VerificationStatus {
  isWhitelisted: boolean;
  isExpired: boolean;
  expiresAt?: Date;
  lastChecked?: Date;
  needsReVerification: boolean;
}

/**
 * Hook to check GoodDollar face verification status
 * Polls on-chain whitelist contract
 */
export function useGoodDollarVerification() {
  const { address } = useAccount();
  const sdk = useIdentitySDK();

  const query = useQuery<VerificationStatus>({
    queryKey: ['gooddollar-verification', address],
    queryFn: async () => {
      if (!address || !sdk) {
        return {
          isWhitelisted: false,
          isExpired: false,
          needsReVerification: false,
        };
      }

      try {
        const { isWhitelisted, root } = await sdk.getWhitelistedRoot(
          address as `0x${string}`,
        );

        // Get expiry data
        let expiresAt: Date | undefined;
        let needsReVerification = false;

        try {
          const expiryData = await sdk.getIdentityExpiryData(
            address as `0x${string}`,
          );
          if (expiryData.expiryTimestamp) {
            expiresAt = new Date(expiryData.expiryTimestamp * 1000);
            needsReVerification = new Date() > expiresAt;
          }
        } catch (error) {
          log.warn('Failed to get expiry data', { address, error });
        }

        log.info('Verification status checked', {
          address,
          isWhitelisted,
          expiresAt,
          needsReVerification,
        });

        return {
          isWhitelisted,
          isExpired: needsReVerification,
          expiresAt,
          lastChecked: new Date(),
          needsReVerification,
        };
      } catch (error) {
        log.error('Failed to check verification status', { address, error });
        return {
          isWhitelisted: false,
          isExpired: false,
          needsReVerification: false,
        };
      }
    },
    enabled: !!address && !!sdk,
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    staleTime: 2 * 60 * 1000, // Cache for 2 minutes
  });

  return query;
}
```

### 8. User Verification Status Display

```typescript
// components/gooddollar/VerificationStatus.tsx
import { useGoodDollarVerification } from '@/hooks/useGoodDollarVerification';
import { useAccount } from 'wagmi';
import { FaceVerificationButton } from './FaceVerificationButton';
import { CheckCircle, AlertCircle, Clock } from 'lucide-react';

export function VerificationStatus() {
  const { address } = useAccount();
  const { data: status, isLoading } = useGoodDollarVerification();

  if (isLoading) {
    return <div>Checking verification status...</div>;
  }

  if (!address) {
    return null;
  }

  // Verified and not expired
  if (status?.isWhitelisted && !status.needsReVerification) {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle size={20} />
        <span>Verified with GoodDollar</span>
        {status.expiresAt && (
          <span className="text-xs text-gray-500">
            Expires {new Date(status.expiresAt).toLocaleDateString()}
          </span>
        )}
      </div>
    );
  }

  // Needs re-verification
  if (status?.needsReVerification) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-yellow-600">
          <AlertCircle size={20} />
          <span>Verification Expired - Please Re-verify</span>
        </div>
        <FaceVerificationButton className="w-full" />
      </div>
    );
  }

  // Not verified
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-gray-600">
        <Clock size={20} />
        <span>Verify your identity with GoodDollar</span>
      </div>
      <FaceVerificationButton className="w-full" />
    </div>
  );
}
```

---

## Integration with Enrollment Flow

### Option 1: Required Verification Before Enrollment Completion

```typescript
// pages/api/enrollment/complete.ts
import { getPrivyUser } from '@/lib/auth/privy';
import { checkWhitelistStatus } from '@/lib/gooddollar/identity-sdk';

export default async function completeEnrollmentHandler(req, res) {
  const privy = await getPrivyUser(req);

  if (!privy.user?.wallet?.address) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const address = privy.user.wallet.address as `0x${string}`;

  // Check if face verification is required
  const requireFaceVerification = process.env.NEXT_PUBLIC_REQUIRE_FACE_VERIFICATION === 'true';

  if (requireFaceVerification) {
    const { isWhitelisted } = await checkWhitelistStatus(address);

    if (!isWhitelisted) {
      return res.status(403).json({
        error: 'Face verification required',
        requiresFaceVerification: true,
        redirectTo: '/gooddollar/verify',
      });
    }
  }

  // Continue with enrollment...
}
```

### Option 2: Optional Verification with Badge

```typescript
// Add to user profile or dashboard
import { VerificationStatus } from '@/components/gooddollar/VerificationStatus';

function UserProfile() {
  return (
    <div>
      <h1>My Profile</h1>
      <VerificationStatus />
      {/* Rest of profile... */}
    </div>
  );
}
```

---

## Security Best Practices

### ✅ DO:
1. **Always verify on-chain** - Never trust client-side verification status
2. **Validate callback parameters** - Ensure address matches connected wallet
3. **Check address format** - Validate Ethereum address format
4. **Require authentication** - Only allow authenticated users to verify
5. **Store proof hash** - Maintain audit trail of verification responses
6. **Track expiry timestamps** - Remind users to re-verify periodically
7. **Log verification events** - Monitor for suspicious patterns

### ❌ DON'T:
1. Trust URL parameters alone for access granting
2. Grant access before on-chain verification
3. Store facial data or personal identifiable information
4. Implement client-side-only verification checks
5. Skip address validation
6. Allow multiple verifications from different addresses simultaneously

---

## Error Handling

```typescript
// lib/gooddollar/error-handler.ts
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:error-handler');

export class GoodDollarError extends Error {
  constructor(
    public code: string,
    public message: string,
    public details?: any,
  ) {
    super(message);
    this.name = 'GoodDollarError';
  }
}

export const GoodDollarErrors = {
  SDK_NOT_INITIALIZED: {
    code: 'SDK_NOT_INITIALIZED',
    message: 'GoodDollar SDK failed to initialize',
  },
  INVALID_ADDRESS: {
    code: 'INVALID_ADDRESS',
    message: 'Invalid Ethereum address format',
  },
  VERIFICATION_FAILED: {
    code: 'VERIFICATION_FAILED',
    message: 'Face verification failed',
  },
  NOT_WHITELISTED: {
    code: 'NOT_WHITELISTED',
    message: 'Address is not whitelisted on-chain',
  },
  VERIFICATION_EXPIRED: {
    code: 'VERIFICATION_EXPIRED',
    message: 'Verification has expired and needs re-verification',
  },
  ADDRESS_MISMATCH: {
    code: 'ADDRESS_MISMATCH',
    message: 'Callback address does not match connected wallet',
  },
  UNAUTHENTICATED: {
    code: 'UNAUTHENTICATED',
    message: 'User is not authenticated',
  },
};

export function handleGoodDollarError(error: any) {
  if (error instanceof GoodDollarError) {
    log.error(`${error.code}: ${error.message}`, { details: error.details });
    return error;
  }

  log.error('Unknown GoodDollar error', { error });
  return new GoodDollarError(
    'UNKNOWN_ERROR',
    'An unknown error occurred with GoodDollar SDK',
    error,
  );
}
```

---

## Testing the Integration

### 1. Test in Staging Environment

```bash
# Set environment variables for testing
NEXT_PUBLIC_GOODDOLLAR_ENV=staging
NEXT_PUBLIC_TARGET_NETWORK=sepolia
NEXT_PUBLIC_GOODDOLLAR_CALLBACK_URL=http://localhost:3000/api/gooddollar/verify-callback
```

### 2. Test Verification Flow

```typescript
// __tests__/gooddollar/face-verification.test.ts
import { checkWhitelistStatus } from '@/lib/gooddollar/identity-sdk';

describe('Face Verification', () => {
  it('should check whitelist status', async () => {
    const testAddress = '0x...' as `0x${string}`;
    const result = await checkWhitelistStatus(testAddress);
    expect(result).toHaveProperty('isWhitelisted');
    expect(result).toHaveProperty('root');
  });
});
```

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| SDK not initialized | Wallet/public client not ready | Check wagmi provider setup |
| "Invalid address format" | Malformed address in callback | Validate callback URL whitelist in GoodDollar portal |
| "Address mismatch" | User hijacking attempt | Ensure address matches connected wallet |
| "Not whitelisted" | Face verification failed on-chain | User needs to retry verification |
| "Verification expired" | 14-day period has passed | Prompt user to re-verify |

---

## Integration Checklist

- [ ] Install `@goodsdks/citizen-sdk`
- [ ] Configure environment variables (NEXT_PUBLIC_GOODDOLLAR_ENV, NEXT_PUBLIC_GOODDOLLAR_CALLBACK_URL)
- [ ] Register app on GoodDollar Developer Portal
- [ ] Whitelist callback URL in GoodDollar portal
- [ ] Apply database migration (106_face_verification.sql)
- [ ] Create `lib/gooddollar/` directory structure
- [ ] Implement IdentitySDK initialization (server + client)
- [ ] Implement display name utility
- [ ] Create FV link generation function
- [ ] Implement callback handler with on-chain verification
- [ ] Create FaceVerificationButton component
- [ ] Create verification status display component
- [ ] Create useGoodDollarVerification hook
- [ ] Test verification flow in staging
- [ ] Add error handling and logging
- [ ] Document callback URL for users
- [ ] Set up monitoring for verification events
- [ ] Test re-verification flow (after 14 days)
- [ ] Integrate with enrollment flow
- [ ] Add security validations
- [ ] Create admin panel for verification status viewing
- [ ] Test on target network (Base/Celo/Ethereum)
- [ ] Deploy to production

---

## Resources

- **Official GoodDollar SDK**: https://github.com/GoodDollar/GoodSdks
- **IdentitySDK Docs**: https://docs.gooddollar.org/for-developers/apis-and-sdks/sybil-resistance/identity-viem-wagmi
- **Viem Documentation**: https://viem.sh/
- **Wagmi Documentation**: https://wagmi.sh/
- **FaceTec ZoOm**: https://www.facetec.com/

---

## Next Steps

1. **Install package**: `npm install @goodsdks/citizen-sdk`
2. **Create directory**: `mkdir -p lib/gooddollar`
3. **Implement utilities**: Create files from Section "Core Implementation"
4. **Set up callback handler**: `pages/api/gooddollar/verify-callback.ts`
5. **Create UI components**: Add FaceVerificationButton and VerificationStatus
6. **Test on staging**: Verify flow works end-to-end
7. **Integrate with enrollment**: Add verification gate to enrollment
8. **Deploy to production**: Use correct GOODDOLLAR_ENV and callback URL

This comprehensive guide replaces the previous outdated version and aligns with your project's current tech stack (Viem/Wagmi, Privy, TypeScript).

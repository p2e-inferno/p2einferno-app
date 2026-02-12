/**
 * Generic API helper for gasless attestation handling
 *
 * Extracted pattern from /pages/api/checkin/index.ts (lines 115-210)
 * Provides reusable server-side attestation logic with graceful degradation
 */

import { createDelegatedAttestation } from "@/lib/attestation/core/delegated";
import { isEASEnabled, type SchemaKey } from "@/lib/attestation/core/config";
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";
import { getDefaultNetworkName } from "@/lib/attestation/core/network-config";
import { getLogger } from "@/lib/utils/logger";
import { validateWalletOwnership } from "@/lib/auth/privy";
import type {
  DelegatedAttestationSignature,
  GaslessAttestationResult,
} from "./types";

const log = getLogger("lib:attestation:api:helpers");

/**
 * Check if EAS failures should gracefully degrade (action succeeds without attestation)
 * This can be configured per-schema or globally via environment variables
 */
function shouldGracefullyDegradeEASFailures(schemaKey?: SchemaKey): boolean {
  // Check schema-specific flag first (e.g., MILESTONE_EAS_GRACEFUL_DEGRADE)
  if (schemaKey) {
    const schemaSpecificKey = `${schemaKey.toUpperCase()}_EAS_GRACEFUL_DEGRADE`;
    const schemaSpecific = process.env[schemaSpecificKey];
    if (schemaSpecific !== undefined) {
      return schemaSpecific === "true";
    }
  }

  // Fall back to global setting
  return process.env.EAS_GRACEFUL_DEGRADE === "true";
}

/**
 * Handle gasless attestation creation on the server side
 *
 * This function:
 * 1. Checks if EAS is enabled
 * 2. Validates the signature recipient matches expected user
 * 3. Resolves schema UID from database
 * 4. Calls createDelegatedAttestation() to submit on-chain
 * 5. Returns UID or handles graceful degradation
 *
 * @param params - Attestation parameters
 * @param params.signature - Delegated attestation signature from client (null if not provided)
 * @param params.schemaKey - Schema key to resolve UID (e.g., 'xp_renewal', 'milestone_achievement')
 * @param params.recipient - Expected recipient address (for validation)
 * @param params.gracefulDegrade - Whether to continue on attestation failure (default: global setting)
 * @param params.network - Network name (default: from config)
 *
 * @returns Result with success status, UID (if successful), txHash, or error message
 */
export async function handleGaslessAttestation(params: {
  signature: DelegatedAttestationSignature | null;
  schemaKey: SchemaKey;
  recipient: string;
  gracefulDegrade?: boolean;
  network?: string;
}): Promise<GaslessAttestationResult> {
  const {
    signature,
    schemaKey,
    recipient,
    gracefulDegrade: customGracefulDegrade,
    network,
  } = params;

  // Determine graceful degradation setting
  const gracefulDegrade =
    customGracefulDegrade !== undefined
      ? customGracefulDegrade
      : shouldGracefullyDegradeEASFailures(schemaKey);

  // Check if EAS is enabled
  const easEnabled = isEASEnabled();
  if (!easEnabled) {
    log.debug("EAS is disabled, skipping attestation", { schemaKey });
    return {
      success: true, // Action succeeds even without attestation
    };
  }

  // Check if signature was provided
  if (!signature) {
    const message = `EAS enabled but no attestation signature provided for ${schemaKey}`;
    if (gracefulDegrade) {
      log.warn(message);
      return { success: true }; // Continue without attestation
    } else {
      log.error(message);
      return {
        success: false,
        error: "Attestation signature is required",
      };
    }
  }

  try {
    // Validate signature recipient matches expected user address
    // This prevents mismatched attestations (e.g., XP awarded to one user but attested to another)
    if (signature.recipient.toLowerCase() !== recipient.toLowerCase()) {
      const message = `Signature recipient (${signature.recipient}) does not match expected recipient (${recipient})`;
      log.error(message, { schemaKey });
      return {
        success: false,
        error: "Signature recipient mismatch",
      };
    }

    // Resolve schema UID from database
    const resolvedNetwork = network || getDefaultNetworkName();
    const resolvedSchemaUid = await resolveSchemaUID(
      schemaKey,
      resolvedNetwork,
    );

    if (!resolvedSchemaUid) {
      const message = `Schema UID not found for key '${schemaKey}' on network '${resolvedNetwork}'`;
      if (gracefulDegrade) {
        log.warn(message);
        return { success: true }; // Continue without attestation
      } else {
        log.error(message);
        return {
          success: false,
          error: "Schema UID not configured",
        };
      }
    }

    // Ensure the client signed for the same schema UID we're about to submit.
    // This avoids wasting gas on inevitable reverts if the client has stale schema UIDs.
    if (
      typeof signature.schemaUid === "string" &&
      signature.schemaUid.toLowerCase() !== resolvedSchemaUid.toLowerCase()
    ) {
      const message = `Signature schema UID (${signature.schemaUid}) does not match resolved schema UID (${resolvedSchemaUid})`;
      log.error(message, { schemaKey, network: resolvedNetwork });
      return {
        success: false,
        error: "Signature schema UID mismatch",
      };
    }

    log.info("Creating delegated attestation", {
      schemaKey,
      schemaUid: resolvedSchemaUid,
      recipient,
      network: resolvedNetwork,
    });

    // Create delegated attestation using service wallet
    const attestationResult = await createDelegatedAttestation({
      schemaUid: resolvedSchemaUid,
      recipient: signature.recipient,
      data: signature.data,
      signature: signature.signature,
      deadline: signature.deadline,
      chainId: signature.chainId,
      expirationTime: signature.expirationTime,
      revocable: signature.revocable,
      refUID: signature.refUID,
    });

    if (attestationResult.success && attestationResult.uid) {
      log.info("Delegated attestation created successfully", {
        schemaKey,
        uid: attestationResult.uid,
        txHash: attestationResult.txHash,
        recipient,
      });

      return {
        success: true,
        uid: attestationResult.uid,
        txHash: attestationResult.txHash,
      };
    } else {
      const message =
        attestationResult.error || "Failed to create delegated attestation";
      log.error("Failed to create delegated attestation", {
        schemaKey,
        error: message,
        recipient,
      });

      if (gracefulDegrade) {
        return { success: true }; // Action succeeds even if attestation failed
      } else {
        return {
          success: false,
          error: message,
        };
      }
    }
  } catch (error: any) {
    const message = error?.message || "Exception during attestation creation";
    log.error("Exception during delegated attestation creation", {
      schemaKey,
      error: message,
      recipient,
    });

    if (gracefulDegrade) {
      return { success: true }; // Action succeeds even if attestation failed
    } else {
      return {
        success: false,
        error: message,
      };
    }
  }
}

/**
 * Extract and validate wallet address from attestation signature
 *
 * Multi-wallet support:
 * - Extracts the wallet address from the signature (the wallet that signed it)
 * - Validates this wallet belongs to the authenticated user's linked accounts
 * - Returns the validated wallet address for use in attestations
 *
 * This ensures attestations are created for the user's currently connected wallet,
 * not stale database values, supporting users who switch between linked wallets.
 *
 * @param params - Validation parameters
 * @param params.userId - Privy user ID (e.g., "did:privy:...")
 * @param params.attestationSignature - Client-provided attestation signature (or null if not provided)
 * @param params.context - Context for logging (e.g., "quest-claim", "milestone-claim")
 *
 * @returns Validated wallet address
 * @throws Error if EAS is enabled but signature not provided or wallet doesn't belong to user
 *
 * @example
 * const userWalletAddress = await extractAndValidateWalletFromSignature({
 *   userId: authUser.id,
 *   attestationSignature,
 *   context: "quest-claim"
 * });
 */
export async function extractAndValidateWalletFromSignature(params: {
  userId: string;
  attestationSignature: DelegatedAttestationSignature | null | undefined;
  context: string;
}): Promise<string | null> {
  const { userId, attestationSignature, context } = params;

  // If EAS is disabled, no wallet validation needed
  if (!isEASEnabled()) {
    log.debug("EAS disabled, skipping wallet validation", { context });
    return null;
  }

  // When EAS is enabled, signature is required
  if (!attestationSignature) {
    log.error("Attestation signature required but not provided", {
      context,
      userId,
    });
    throw new Error("Attestation signature is required to claim rewards");
  }

  // Extract wallet address from signature (the wallet that signed it)
  const signatureWallet = attestationSignature.recipient;

  // Validate wallet ownership using shared helper
  return await validateWalletOwnership(userId, signatureWallet, context);
}

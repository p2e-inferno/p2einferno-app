/**
 * Generic hook for signing delegated attestations using EAS SDK
 *
 * This follows the gasless attestation pattern where:
 * - User signs an EIP-712 message using EAS SDK (no gas cost, no transaction)
 * - EAS SDK handles the correct domain construction automatically
 * - Server wallet submits the transaction and pays gas
 * - Real attestation UID is extracted from on-chain event
 *
 * Implementation copied from useDelegatedAttestationCheckin.ts (proven working pattern)
 */

import { useWallets } from "@privy-io/react-auth";
import { ethers } from "ethers";
import { EAS, SchemaEncoder } from "@ethereum-attestation-service/eas-sdk";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  resolveNetworkConfig,
  getDefaultNetworkName,
} from "@/lib/attestation/core/network-config";
import { resolveSchemaUID } from "@/lib/attestation/schemas/network-resolver";
import type { SchemaKey } from "@/lib/attestation/core/config";
import { getLogger } from "@/lib/utils/logger";
import { useState } from "react";
import type {
  DelegatedAttestationSignature,
  SchemaFieldData,
} from "@/lib/attestation/api/types";

const log = getLogger("hooks:useGaslessAttestation");

const getSupabaseUrl = (): string | null =>
  process.env.NEXT_PUBLIC_SUPABASE_URL || null;
const getSupabaseAnonKey = (): string | null =>
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null;

let publicSupabaseClient:
  | ReturnType<typeof createSupabaseClient>
  | null
  | undefined;

const getPublicSupabaseClient = () => {
  if (publicSupabaseClient !== undefined) return publicSupabaseClient;
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    publicSupabaseClient = null;
    return publicSupabaseClient;
  }
  publicSupabaseClient = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return publicSupabaseClient;
};

const normalizeSchemaDefinition = (schema: string): string =>
  schema
    .split(",")
    .map((part) => part.trim().replace(/\s+/g, " "))
    .join(",");

const resolveSchemaDefinition = async (
  schemaKey: SchemaKey,
  network: string,
): Promise<string | null> => {
  const supabase = getPublicSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("attestation_schemas")
    .select("schema_definition")
    .eq("schema_key", schemaKey)
    .eq("network", network)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.warn("Failed to resolve schema definition from DB", {
      schemaKey,
      network,
      error: error.message,
    });
    return null;
  }

  const schemaDefinition = (data as any)?.schema_definition;
  return typeof schemaDefinition === "string" && schemaDefinition.length > 0
    ? schemaDefinition
    : null;
};

export const useGaslessAttestation = () => {
  const { wallets } = useWallets();
  const [isSigning, setIsSigning] = useState(false);

  const signAttestation = async (params: {
    schemaKey: SchemaKey; // Schema key to resolve UID from database (e.g., 'xp_renewal', 'milestone_achievement')
    recipient: string; // Address that will receive the attestation
    schemaData: SchemaFieldData[]; // Array of { name, value, type } for schema encoding
    deadlineSecondsFromNow?: number; // How long the signature is valid (default: 1 hour)
    network?: string; // Network name (default: from config)
    expirationTime?: bigint; // When attestation expires (0 = never)
    revocable?: boolean; // Whether attestation can be revoked (default: false)
    refUID?: string; // Reference UID for linked attestations
  }): Promise<DelegatedAttestationSignature> => {
    const wallet =
      wallets?.find((w: any) => w?.walletClientType && w.walletClientType !== "privy") ||
      wallets?.[0];
    if (!wallet) {
      throw new Error("No wallet connected");
    }

    setIsSigning(true);

    try {
      // Get network config to determine chainId and EAS contract address
      const networkName = params.network || getDefaultNetworkName();
      const networkConfig = await resolveNetworkConfig(networkName);

      if (!networkConfig) {
        throw new Error(`Network ${networkName} not configured`);
      }

      const chainId = networkConfig.chainId;
      const easContractAddress = networkConfig.easContractAddress;

      // Resolve schema UID from database using schema key
      const schemaUid = await resolveSchemaUID(params.schemaKey, networkName);
      if (!schemaUid) {
        throw new Error(
          `Schema UID not found for key '${params.schemaKey}' on network '${networkName}'`
        );
      }

      log.debug("Signing delegated attestation", {
        schemaKey: params.schemaKey,
        schemaUid,
        recipient: params.recipient,
        network: networkName,
        chainId,
      });

      // Get ethers provider from Privy wallet
      const provider = await (wallet as any).getEthereumProvider();
      if (!provider) {
        throw new Error("Failed to get Ethereum provider from wallet");
      }

      const ethersProvider = new ethers.BrowserProvider(provider);
      const signer = await ethersProvider.getSigner();

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + (params.deadlineSecondsFromNow ?? 3600)
      );
      const attester = await signer.getAddress();
      const expirationTime = params.expirationTime ?? 0n;
      const revocable = params.revocable ?? false;
      const refUID =
        params.refUID ??
        "0x0000000000000000000000000000000000000000000000000000000000000000";

      // Encode attestation data using SchemaEncoder
      // Build schema string from schemaData array
      const schemaString = params.schemaData
        .map((field) => `${field.type} ${field.name}`)
        .join(",");

      // Guardrail: ensure the encoding schema matches the deployed DB definition for this schema key + network.
      // Prevents silently encoding bytes for an outdated schema (which breaks decoded views on EASScan).
      const expectedSchema = await resolveSchemaDefinition(
        params.schemaKey,
        networkName,
      );
      if (expectedSchema) {
        const expectedNormalized = normalizeSchemaDefinition(expectedSchema);
        const actualNormalized = normalizeSchemaDefinition(schemaString);
        if (expectedNormalized !== actualNormalized) {
          throw new Error(
            `Schema definition mismatch for '${params.schemaKey}' on '${networkName}'. ` +
              `Expected: ${expectedSchema} ` +
              `Got: ${schemaString}`,
          );
        }
      }

      const encoder = new SchemaEncoder(schemaString);
      const encodedData = encoder.encodeData(
        params.schemaData.map((field) => ({
          name: field.name,
          value: field.value,
          type: field.type,
        }))
      );

      // Initialize EAS SDK
      const eas = new EAS(easContractAddress);
      eas.connect(signer);

      // Get delegated interface
      const delegated = await eas.getDelegated();

      // Sign delegated attestation using EAS SDK
      // This handles the correct EIP-712 domain automatically
      const response = await delegated.signDelegatedAttestation(
        {
          schema: schemaUid,
          recipient: params.recipient,
          expirationTime,
          revocable,
          refUID,
          data: encodedData,
          deadline,
          value: 0n,
        },
        signer
      );

      // Normalize signature to 0x rsv string format
      let signature: string;
      if (typeof response.signature === "string") {
        signature = response.signature;
      } else if (
        typeof response.signature === "object" &&
        "v" in response.signature &&
        "r" in response.signature &&
        "s" in response.signature
      ) {
        // Convert {v, r, s} to 0x rsv format
        const sig = ethers.Signature.from(response.signature as any);
        signature = sig.serialized;
      } else {
        throw new Error("Unexpected signature format from EAS SDK");
      }

      log.info("Successfully signed delegated attestation", {
        schemaKey: params.schemaKey,
        attester,
        recipient: params.recipient,
        network: networkName,
      });

      return {
        signature,
        // JSON-safe for API calls (BigInt breaks JSON.stringify)
        deadline: deadline.toString(),
        attester,
        recipient: params.recipient,
        schemaUid,
        data: encodedData,
        expirationTime: expirationTime.toString(),
        revocable,
        refUID,
        chainId,
        network: networkName,
      };
    } catch (error) {
      log.error("Failed to sign delegated attestation", { error });
      throw error;
    } finally {
      setIsSigning(false);
    }
  };

  return { signAttestation, isSigning };
};

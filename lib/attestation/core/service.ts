/**
 * AttestationService - Core service for creating and managing attestations
 * Adapted from Teerex implementation for P2E Inferno
 */

import { ethers } from "ethers";
import { EAS } from "@ethereum-attestation-service/eas-sdk";
import { supabase } from "@/lib/supabase";
import { getLogger } from "@/lib/utils/logger";
import { EAS_CONFIG, EAS_ABI } from "./config";
import { createEthersFromPrivyWallet } from "@/lib/blockchain/shared/client-utils";
import {
  AttestationResult,
  CreateAttestationParams,
  RevokeAttestationParams,
  Attestation,
  AttestationSchema,
} from "./types";

const log = getLogger("lib:attestation:service");

export class AttestationService {
  private eas: EAS | null = null;

  /**
   * Initialize EAS instance with signer
   */
  private async initialize(signer: ethers.Signer): Promise<void> {
    this.eas = new EAS(EAS_CONFIG.CONTRACT_ADDRESS);
    this.eas.connect(signer);
  }

  /**
   * Create an attestation on-chain and save to database
   */
  async createAttestation(
    params: CreateAttestationParams,
  ): Promise<AttestationResult> {
    try {
      const {
        schemaUid,
        recipient,
        data,
        expirationTime,
        revocable = true,
        wallet,
      } = params;

      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      // Get schema definition from database
      const schema = await this.getSchemaDefinition(schemaUid);
      if (!schema) {
        throw new Error("Schema not found");
      }

      // Feature gate: ENABLE_EAS env controls whether on-chain attestations run
      const envFlag =
        (process.env.NEXT_PUBLIC_ENABLE_EAS ?? process.env.ENABLE_EAS ?? "") +
        "";
      const isEasEnabled = /^(1|true|yes)$/i.test(envFlag);

      // Schema must be bytes32 to be valid for EAS
      const isHexBytes32 =
        typeof schemaUid === "string" && /^0x[0-9a-fA-F]{64}$/.test(schemaUid);
      const shouldAttestOnChain = isEasEnabled && isHexBytes32;

      let transactionHash = "";

      if (shouldAttestOnChain) {
        // Get Ethereum provider and signer (supports both user.wallet and useWallets() wallets)
        const { signer } = await createEthersFromPrivyWallet(wallet as any);

        if (!signer) {
          throw new Error("Failed to get signer from wallet");
        }

        // Initialize EAS
        await this.initialize(signer);
        if (!this.eas) {
          throw new Error("Failed to initialize EAS");
        }
      } else {
        log.warn(
          "Non-hex schema UID detected; skipping on-chain attest and saving DB-only record",
          { schemaUid },
        );
      }

      // Encode data using EAS SDK
      const encodedData = this.encodeDataForSchema(
        schema.schema_definition,
        data,
      );

      log.info("Creating attestation with EAS SDK", {
        schema: schemaUid,
        recipient,
        data,
        encodedData,
      });

      if (shouldAttestOnChain && this.eas) {
        // Create attestation using EAS SDK
        const tx = await this.eas.attest({
          schema: schemaUid,
          data: {
            recipient: recipient,
            expirationTime: BigInt(expirationTime || 0),
            revocable: revocable && schema.revocable,
            refUID:
              "0x0000000000000000000000000000000000000000000000000000000000000000",
            data: encodedData,
          },
        });

        log.info("EAS SDK transaction sent", { tx });

        if (typeof tx === "string") {
          transactionHash = tx;
        } else if (tx && typeof tx === "object") {
          if ((tx as any).hash) {
            transactionHash = (tx as any).hash;
          } else if ((tx as any).data?.hash) {
            transactionHash = (tx as any).data.hash;
          }
        }
      }

      // Fallback transaction hash when not on-chain or when hash not present
      if (!transactionHash) {
        transactionHash = `temp_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
      }

      log.info("Transaction hash", { transactionHash });

      // Optional duplicate prevention: skip for flows that allow multiples (e.g., daily check-ins)
      if (!params.allowMultiple) {
        const existingAttestation = await this.checkExistingAttestation(
          recipient,
          schemaUid,
        );
        if (existingAttestation) {
          return {
            success: false,
            error: "You have already created an attestation for this schema",
          };
        }
      }

      // Do not insert DB rows here; API will persist if needed

      return {
        success: true,
        attestationUid: transactionHash,
        transactionHash,
      };
    } catch (error) {
      log.error("Error creating attestation", { error });
      return {
        success: false,
        error: this.handleError(error),
      };
    }
  }

  /**
   * Revoke an attestation on-chain
   */
  async revokeAttestation(
    params: RevokeAttestationParams,
  ): Promise<AttestationResult> {
    try {
      const { schemaUid, attestationUid, wallet } = params;

      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      const { signer } = await createEthersFromPrivyWallet(wallet as any);

      const easContract = new ethers.Contract(
        EAS_CONFIG.CONTRACT_ADDRESS,
        EAS_ABI,
        signer,
      );

      const revocationRequest = {
        schema: schemaUid,
        uid: attestationUid,
      };

      const tx = await (easContract as any).revoke(revocationRequest);
      const receipt = await tx.wait();

      if (receipt.status !== 1) {
        throw new Error("Transaction failed");
      }

      // Update attestation in database
      const { error } = await supabase
        .from("attestations")
        .update({
          is_revoked: true,
          revocation_time: new Date().toISOString(),
        })
        .eq("attestation_uid", attestationUid);

      if (error) {
        log.error("Error updating attestation in database", { error });
      }

      return {
        success: true,
        transactionHash: tx.hash,
      };
    } catch (error) {
      log.error("Error revoking attestation", { error });
      return {
        success: false,
        error: this.handleError(error),
      };
    }
  }

  /**
   * Get attestations for a specific recipient
   */
  async getAttestations(
    recipient: string,
    schemaUid?: string,
  ): Promise<Attestation[]> {
    try {
      let query = supabase
        .from("attestations")
        .select(
          `
          *,
          attestation_schemas (
            name,
            description,
            category
          )
        `,
        )
        .eq("recipient", recipient)
        .eq("is_revoked", false)
        .order("created_at", { ascending: false });

      if (schemaUid) {
        query = query.eq("schema_uid", schemaUid);
      }

      const { data, error } = await query;

      if (error) {
        log.error("Error fetching attestations", { error });
        return [];
      }

      return data || [];
    } catch (error) {
      log.error("Error fetching attestations", { error });
      return [];
    }
  }

  /**
   * Get schema definition from database
   */
  private async getSchemaDefinition(
    schemaUid: string,
  ): Promise<AttestationSchema | null> {
    try {
      const { data, error } = await supabase
        .from("attestation_schemas")
        .select("*")
        .eq("schema_uid", schemaUid)
        .single();

      if (error || !data) {
        log.error("Schema not found", { error });
        return null;
      }

      return data;
    } catch (error) {
      log.error("Error fetching schema", { error });
      return null;
    }
  }

  /**
   * Check if an attestation already exists
   */
  private async checkExistingAttestation(
    recipient: string,
    schemaUid: string,
  ): Promise<boolean> {
    try {
      const { data } = await supabase
        .from("attestations")
        .select("id")
        .eq("recipient", recipient)
        .eq("schema_uid", schemaUid)
        .eq("is_revoked", false)
        .single();

      return !!data;
    } catch (error) {
      // No existing attestation found
      return false;
    }
  }

  /**
   * Encode data according to schema definition
   */
  private encodeDataForSchema(
    schemaDefinition: string,
    data: Record<string, any>,
  ): string {
    try {
      const fields = schemaDefinition.split(",").map((field) => field.trim());
      const types: string[] = [];
      const values: any[] = [];

      fields.forEach((field) => {
        const parts = field.split(" ");
        if (parts.length !== 2) {
          throw new Error(`Invalid field format: ${field}`);
        }
        const [type, name] = parts;
        types.push(type!);

        if (data[name!] !== undefined) {
          // Convert BigInt and numbers properly
          if (type!.startsWith("uint") && typeof data[name!] === "number") {
            values.push(BigInt(data[name!]));
          } else {
            values.push(data[name!]);
          }
        } else {
          // Provide defaults based on type
          if (type! === "address") {
            values.push(ethers.ZeroAddress);
          } else if (type!.startsWith("uint")) {
            values.push(BigInt(0));
          } else {
            values.push("");
          }
        }
      });

      log.debug("Encoding data", { types, values });
      return ethers.AbiCoder.defaultAbiCoder().encode(types, values);
    } catch (error) {
      log.error("Error encoding attestation data", { error });
      throw new Error(
        "Failed to encode attestation data: " +
          (error instanceof Error ? error.message : "Unknown error"),
      );
    }
  }


  /**
   * Handle and format errors
   */
  private handleError(error: any): string {
    if (error instanceof Error) {
      if (
        error.message.includes("User rejected") ||
        error.message.includes("user rejected")
      ) {
        return "Transaction was cancelled by user";
      }
      return error.message;
    }
    return "Failed to process attestation";
  }
}

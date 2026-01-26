import { createAdminClient } from "@/lib/supabase/server";
import { getLogger } from "@/lib/utils/logger";
import { keccak256, stringToHex } from "viem";
import { ethers } from "ethers";

const log = getLogger("auth:admin-signed-action");

const ACTION_TTL_SECONDS = 300;

export type AdminSignedAction = {
  action: string;
  network: string;
  schemaDefinitionHash: `0x${string}`;
  schemaUid: string;
  transactionHash: string;
  timestamp: number;
  nonce: string;
};

const buildActionHash = (message: AdminSignedAction): `0x${string}` =>
  keccak256(
    stringToHex(
      [
        message.action,
        message.network,
        message.schemaDefinitionHash,
        message.schemaUid,
        message.transactionHash,
        String(message.timestamp),
        message.nonce,
      ].join("|"),
    ),
  );

const isTimestampFresh = (timestamp: number): boolean => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Math.abs(nowSeconds - timestamp) <= ACTION_TTL_SECONDS;
};

export async function verifyAdminSignedAction(params: {
  address: `0x${string}`;
  chainId: number;
  message: AdminSignedAction;
  signature: `0x${string}`;
}): Promise<{ valid: boolean; error?: string }> {
  if (!isTimestampFresh(params.message.timestamp)) {
    return { valid: false, error: "Signature timestamp expired" };
  }

  // Use ethers for verification (same as TeeRex) to match client-side encoding
  const domain = {
    name: "P2E Inferno Admin",
    version: "1",
    chainId: params.chainId, // ethers uses number, not bigint
  };

  const types = {
    AdminAction: [
      { name: "action", type: "string" },
      { name: "network", type: "string" },
      { name: "schemaDefinitionHash", type: "bytes32" },
      { name: "schemaUid", type: "string" },
      { name: "transactionHash", type: "string" },
      { name: "timestamp", type: "uint256" },
      { name: "nonce", type: "string" },
    ],
  };

  const value = {
    action: params.message.action,
    network: params.message.network,
    schemaDefinitionHash: params.message.schemaDefinitionHash,
    schemaUid: params.message.schemaUid,
    transactionHash: params.message.transactionHash,
    timestamp: params.message.timestamp, // Keep as number
    nonce: params.message.nonce,
  };

  let recovered: string;
  try {
    // Use ethers.verifyTypedData (same as TeeRex pattern)
    recovered = ethers.verifyTypedData(domain, types, value, params.signature);
  } catch (error: any) {
    log.warn("Admin signature verification failed", {
      error: error?.message || "unknown error",
      chainId: params.chainId,
      message: params.message,
      signaturePrefix: params.signature.slice(0, 12),
    });
    return { valid: false, error: "Admin signature verification failed" };
  }

  const recoveredLowercase = recovered.toLowerCase();
  const expectedLowercase = params.address.toLowerCase();

  if (recoveredLowercase !== expectedLowercase) {
    return { valid: false, error: "Invalid admin action signature" };
  }

  const actionHash = buildActionHash(params.message);
  const supabase = createAdminClient();
  const expiresAt = new Date(
    (params.message.timestamp + ACTION_TTL_SECONDS) * 1000,
  ).toISOString();

  const { error } = await supabase.from("admin_action_nonces").insert({
    wallet_address: params.address.toLowerCase(),
    action_hash: actionHash,
    nonce: params.message.nonce,
    expires_at: expiresAt,
  });

  if (error) {
    if (error.code === "23505") {
      return { valid: false, error: "Admin action replay detected" };
    }
    log.warn("Admin action nonce insert failed", {
      error: error.message,
    });
    return { valid: false, error: "Failed to register admin action nonce" };
  }

  return { valid: true };
}

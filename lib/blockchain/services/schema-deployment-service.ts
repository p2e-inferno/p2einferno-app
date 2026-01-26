import {
  decodeEventLog,
  encodePacked,
  keccak256,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import { getLogger } from "@/lib/utils/logger";
import {
  SCHEMA_REGISTRY_ABI,
  SCHEMA_REGISTRY_READ_ABI,
  SCHEMA_REGISTRY_REGISTERED_EVENT_ABI,
} from "@/lib/attestation/core/config";
import { isBytes32Hex } from "@/lib/attestation/utils/hex";

const log = getLogger("blockchain:schema-deployment-service");

export type DeploySchemaParams = {
  schemaDefinition: string;
  resolver?: Address;
  revocable?: boolean;
};

export type DeploySchemaResult = {
  success: boolean;
  schemaUid?: string;
  transactionHash?: `0x${string}`;
  error?: string;
  retryCount?: number;
};

export type VerifySchemaResult = {
  exists: boolean;
  schemaDefinition?: string;
  revocable?: boolean;
  error?: string;
};

export type GetSchemaFromTxResult = {
  success: boolean;
  schemaUid?: string;
  schemaDefinition?: string;
  revocable?: boolean;
  error?: string;
};

const DEFAULT_RESOLVER = "0x0000000000000000000000000000000000000000" as const;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isPermanentError = (errorMessage: string): boolean => {
  const permanentErrors = [
    "invalid schema",
    "invalid resolver",
    "invalid address",
    "contract not found",
    "function not found",
    "account not available",
    "wallet client not configured",
  ];
  const lower = errorMessage.toLowerCase();
  return permanentErrors.some((entry) => lower.includes(entry));
};

const extractSchemaUidFromReceipt = (
  receipt: any,
  registryAddress: Address,
): string | null => {
  const logs = receipt?.logs || [];
  for (const logEntry of logs) {
    try {
      if (
        logEntry?.address?.toLowerCase() !== registryAddress.toLowerCase()
      ) {
        continue;
      }
      const decoded = decodeEventLog({
        abi: SCHEMA_REGISTRY_REGISTERED_EVENT_ABI,
        data: logEntry.data,
        topics: logEntry.topics,
      });
      if (decoded?.eventName === "Registered") {
        const uid = (decoded.args as any)?.uid;
        if (uid && isBytes32Hex(uid)) {
          return uid;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
};

const deriveSchemaUid = (params: {
  schemaDefinition: string;
  resolver: Address;
  revocable: boolean;
}): `0x${string}` =>
  keccak256(
    encodePacked(
      ["string", "address", "bool"],
      [params.schemaDefinition, params.resolver, params.revocable],
    ),
  );

export async function deploySchema(
  walletClient: WalletClient,
  publicClient: PublicClient,
  networkConfig: { schemaRegistryAddress: Address },
  params: DeploySchemaParams,
  maxRetries = 1,
  retryDelay = 2000,
): Promise<DeploySchemaResult> {
  if (!walletClient || !walletClient.account) {
    return {
      success: false,
      error: "Wallet client not configured or account not available",
    };
  }

  let lastError = "";
  let retryCount = 0;
  let txHash: `0x${string}` | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const resolver = params.resolver || DEFAULT_RESOLVER;
      const revocable = Boolean(params.revocable);

      const expectedUid = deriveSchemaUid({
        schemaDefinition: params.schemaDefinition,
        resolver,
        revocable,
      });

      const existing = await verifySchemaOnChain(
        publicClient,
        networkConfig,
        expectedUid,
      );
      if (existing.exists) {
        log.info("Schema already exists on-chain", {
          schemaUid: expectedUid,
          schemaRegistry: networkConfig.schemaRegistryAddress,
        });
        return {
          success: true,
          schemaUid: expectedUid,
        };
      }

      log.info("Deploying schema", {
        attempt,
        schemaRegistry: networkConfig.schemaRegistryAddress,
      });

      if (!txHash) {
        txHash = await walletClient.writeContract({
          address: networkConfig.schemaRegistryAddress,
          abi: SCHEMA_REGISTRY_ABI,
          functionName: "register",
          args: [
            params.schemaDefinition,
            resolver,
            revocable,
          ],
          account: walletClient.account,
          chain: walletClient.chain,
        });

        log.info("Schema deployment transaction sent", { txHash });
      }

      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 2,
      });

      if (receipt?.status !== "success") {
        lastError = "Transaction reverted on-chain";
        log.error("Schema deployment transaction reverted", {
          txHash,
          receipt,
        });
        break;
      }

      const schemaUid = extractSchemaUidFromReceipt(
        receipt,
        networkConfig.schemaRegistryAddress,
      );
      if (!schemaUid) {
        lastError = "Failed to extract schema UID from transaction logs";
        log.error("Schema UID extraction failed", { txHash, receipt });
        break;
      }

      return {
        success: true,
        schemaUid,
        transactionHash: txHash,
        retryCount: attempt,
      };
    } catch (error: any) {
      lastError = error?.message || "Transaction failed";
      log.error("Schema deployment attempt failed", {
        error: lastError,
        attempt,
      });

      if (txHash) {
        break;
      }

      if (isPermanentError(lastError)) {
        break;
      }
    }

    if (attempt < maxRetries) {
      retryCount = attempt + 1;
      log.info("Retrying schema deployment", { retryCount, retryDelay });
      await delay(retryDelay);
    }
  }

  return {
    success: false,
    error: lastError || "Failed to deploy schema",
    transactionHash: txHash,
    retryCount,
  };
}

export async function verifySchemaOnChain(
  publicClient: PublicClient,
  networkConfig: { schemaRegistryAddress: Address },
  schemaUid: `0x${string}`,
): Promise<VerifySchemaResult> {
  if (!isBytes32Hex(schemaUid)) {
    return { exists: false };
  }
  try {
    const result: any = await publicClient.readContract({
      address: networkConfig.schemaRegistryAddress,
      abi: SCHEMA_REGISTRY_READ_ABI,
      functionName: "getSchema",
      args: [schemaUid],
    });

    if (!result || !result.schema) {
      return { exists: false };
    }

    return {
      exists: true,
      schemaDefinition: result.schema,
      revocable: Boolean(result.revocable),
    };
  } catch (error: any) {
    log.error("Schema verification failed", { error: error?.message });
    return { exists: false, error: error?.message || "Verification failed" };
  }
}

export async function getSchemaFromTransaction(
  publicClient: PublicClient,
  networkConfig: { schemaRegistryAddress: Address },
  transactionHash: `0x${string}`,
): Promise<GetSchemaFromTxResult> {
  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: transactionHash,
    });

    if (!receipt) {
      return { success: false, error: "Transaction receipt not found" };
    }

    if (receipt.to?.toLowerCase() !== networkConfig.schemaRegistryAddress.toLowerCase()) {
      return {
        success: false,
        error: "Transaction was not sent to schema registry",
      };
    }

    if (receipt.status !== "success") {
      return { success: false, error: "Transaction reverted on-chain" };
    }

    const schemaUid = extractSchemaUidFromReceipt(
      receipt,
      networkConfig.schemaRegistryAddress,
    );
    if (!schemaUid) {
      return { success: false, error: "Failed to extract schema UID" };
    }

    return { success: true, schemaUid };
  } catch (error: any) {
    log.error("Failed to derive schema from transaction", {
      error: error?.message,
    });
    return { success: false, error: error?.message || "Lookup failed" };
  }
}

import { ethers } from 'ethers';
import { EAS } from '@ethereum-attestation-service/eas-sdk';
import { createAdminClient } from '@/lib/supabase/server';
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('attestation:delegated');

export interface CreateDelegatedAttestationParams {
  schemaUid: string;
  recipient: string;
  data: string; // 0x encoded attestation data
  signature: string; // 0x rsv format
  deadline: bigint | number | string;
  chainId: number;
  expirationTime?: bigint | number;
  revocable?: boolean;
  refUID?: string;
}

export interface CreateDelegatedAttestationResult {
  success: boolean;
  uid?: string;
  txHash?: string;
  error?: string;
}

/**
 * Create a delegated attestation using the service wallet
 *
 * This function:
 * 1. Verifies the signature hasn't expired
 * 2. Gets network configuration and service wallet
 * 3. Submits the attestation via EAS SDK
 * 4. Waits for the transaction and extracts the real UID
 */
export async function createDelegatedAttestation(
  params: CreateDelegatedAttestationParams
): Promise<CreateDelegatedAttestationResult> {
  try {
    const {
      schemaUid,
      recipient,
      data,
      signature,
      deadline,
      chainId,
      expirationTime = 0,
      revocable = false,
      refUID = '0x0000000000000000000000000000000000000000000000000000000000000000',
    } = params;

    // 1. Verify deadline hasn't expired
    const now = Math.floor(Date.now() / 1000);
    const deadlineNumber = Number(deadline);
    if (deadlineNumber < now) {
      log.warn('Signature deadline expired', { deadline: deadlineNumber, now });
      return {
        success: false,
        error: 'Signature deadline expired',
      };
    }

    // 2. Validate inputs
    const isHex32 = (v: string): boolean => /^0x[0-9a-fA-F]{64}$/.test(v);
    const isHex = (v: string): boolean => /^0x[0-9a-fA-F]*$/.test(v);

    if (!isHex32(schemaUid)) {
      return {
        success: false,
        error: 'Invalid schema UID format',
      };
    }

    if (!ethers.isAddress(recipient)) {
      return {
        success: false,
        error: 'Invalid recipient address',
      };
    }

    if (!isHex(data)) {
      return {
        success: false,
        error: 'Invalid encoded data format',
      };
    }

    // 3. Get service wallet (LOCK_MANAGER_PRIVATE_KEY - same wallet used for milestone claims, key grants)
    const LOCK_MANAGER_PK = process.env.LOCK_MANAGER_PRIVATE_KEY;
    if (!LOCK_MANAGER_PK) {
      log.error('Service wallet not configured');
      return {
        success: false,
        error: 'Server configuration error - service wallet not configured',
      };
    }

    // 4. Get network configuration
    const supabase = createAdminClient();
    const { data: networkData, error: networkError } = await supabase
      .from('eas_networks')
      .select('*')
      .eq('chain_id', chainId)
      .maybeSingle();

    if (networkError || !networkData) {
      log.error('Failed to get network config', { chainId, error: networkError });
      return {
        success: false,
        error: `Chain ${chainId} not supported or not configured`,
      };
    }

    if (!networkData.enabled) {
      return {
        success: false,
        error: `Chain ${chainId} is disabled`,
      };
    }

    const rpcUrl = networkData.rpc_url;
    const easContractAddress = networkData.eas_contract_address;

    if (!rpcUrl) {
      return {
        success: false,
        error: `RPC URL not configured for chain ${chainId}`,
      };
    }

    log.debug('Creating delegated attestation', {
      schemaUid,
      recipient,
      chainId,
      network: networkData.name,
    });

    // 5. Initialize provider and service wallet signer
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(LOCK_MANAGER_PK, provider);

    log.debug('Service wallet address', {
      address: signer.address,
    });

    // 6. Initialize EAS SDK
    const eas = new EAS(easContractAddress);
    eas.connect(signer);

    // 7. Parse signature
    let sigTuple;
    try {
      sigTuple = ethers.Signature.from(signature);
    } catch (error) {
      log.error('Failed to parse signature', { error });
      return {
        success: false,
        error: 'Invalid signature format',
      };
    }

    // 8. Submit delegated attestation
    log.info('Submitting delegated attestation', {
      schemaUid,
      recipient,
      attester: recipient, // User is the attester
    });

    const transaction = await eas.attestByDelegation({
      schema: schemaUid,
      data: {
        recipient,
        expirationTime: BigInt(expirationTime),
        revocable: Boolean(revocable),
        refUID,
        data,
      },
      signature: { v: sigTuple.v, r: sigTuple.r, s: sigTuple.s },
      attester: recipient, // USER is the attester (not service wallet!)
      deadline: BigInt(deadline),
    });

    // 9. Wait for transaction and get real UID
    const newAttestationUID = await transaction.wait();

    const txHash = (transaction as any)?.hash || (transaction as any)?.receipt?.transactionHash;

    log.info('Delegated attestation created successfully', {
      uid: newAttestationUID,
      txHash,
      recipient,
      schemaUid,
    });

    return {
      success: true,
      uid: newAttestationUID,
      txHash,
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to create delegated attestation';
    log.error('Failed to create delegated attestation', {
      error: errorMessage,
      code: error?.code,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

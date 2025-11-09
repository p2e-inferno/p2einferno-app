export interface CertificateClaimParams {
  enrollmentId: string;
  userId: string; // Privy DID
  userAddress: string; // Primary wallet for logging only
  cohortId: string;
  lockAddress: string;
}

export interface CertificateClaimResult {
  success: boolean;
  txHash?: string;
  attestationUid?: string | null;
  attestationPending?: boolean;
  alreadyIssued?: boolean;
  alreadyHasKey?: boolean;
  inProgress?: boolean;
  error?: string;
}

export interface AttestationRetryResult {
  success: boolean;
  uid?: string;
  found?: boolean;
  error?: string;
}

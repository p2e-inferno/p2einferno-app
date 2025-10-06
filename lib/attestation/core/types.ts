/**
 * Core type definitions for the P2E Inferno Attestation System
 * Based on Ethereum Attestation Service (EAS) integration
 */

export interface AttestationRequest {
  schemaUid: string;
  recipient: string;
  data: Record<string, any>;
  revocable?: boolean;
  expirationTime?: number;
}

export interface AttestationResult {
  success: boolean;
  attestationUid?: string;
  transactionHash?: string;
  error?: string;
}

export interface AttestationData {
  [key: string]: string | number | boolean | bigint;
}

export interface Attestation {
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

export interface AttestationSchema {
  id: string;
  schema_uid: string;
  name: string;
  description: string;
  schema_definition: string;
  category: "attendance" | "social" | "verification" | "review" | "achievement";
  revocable: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateAttestationParams {
  schemaUid: string;
  recipient: string;
  data: AttestationData;
  expirationTime?: number;
  revocable?: boolean;
  wallet: any;
}

export interface RevokeAttestationParams {
  schemaUid: string;
  attestationUid: string;
  wallet: any;
}

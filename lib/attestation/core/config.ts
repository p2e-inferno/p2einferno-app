/**
 * EAS Configuration for P2E Inferno
 * Using Base Sepolia testnet (same as Teerex)
 */

export const EAS_CONFIG = {
  // Base Sepolia EAS contract addresses
  CONTRACT_ADDRESS: "0x4200000000000000000000000000000000000021",
  SCHEMA_REGISTRY_ADDRESS: "0x4200000000000000000000000000000000000020",
  NETWORK: "base-sepolia",
  CHAIN_ID: 84532,
} as const;

// EAS Contract ABI - Core functions needed for attestations
export const EAS_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "bytes32", name: "schema", type: "bytes32" },
          { internalType: "address", name: "recipient", type: "address" },
          { internalType: "uint64", name: "expirationTime", type: "uint64" },
          { internalType: "bool", name: "revocable", type: "bool" },
          { internalType: "bytes32", name: "refUID", type: "bytes32" },
          { internalType: "bytes", name: "data", type: "bytes" },
        ],
        internalType: "struct AttestationRequest",
        name: "request",
        type: "tuple",
      },
    ],
    name: "attest",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      {
        components: [
          { internalType: "bytes32", name: "schema", type: "bytes32" },
          { internalType: "bytes32", name: "uid", type: "bytes32" },
        ],
        internalType: "struct RevocationRequest",
        name: "request",
        type: "tuple",
      },
    ],
    name: "revoke",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// Schema Registry ABI - For registering new schemas
export const SCHEMA_REGISTRY_ABI = [
  {
    inputs: [
      { internalType: "string", name: "schema", type: "string" },
      { internalType: "address", name: "resolver", type: "address" },
      { internalType: "bool", name: "revocable", type: "bool" },
    ],
    name: "register",
    outputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Default schema UIDs for P2E Inferno specific attestations
export const P2E_SCHEMA_UIDS = {
  DAILY_CHECKIN: "0xp2e_daily_checkin_001",
  QUEST_COMPLETION: "0xp2e_quest_completion_001",
  BOOTCAMP_COMPLETION: "0xp2e_bootcamp_completion_001",
  MILESTONE_ACHIEVEMENT: "0xp2e_milestone_achievement_001",
} as const;

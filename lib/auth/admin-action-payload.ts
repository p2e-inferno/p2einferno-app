import { keccak256, stringToHex } from "viem";

export const hashAdminActionPayload = (parts: Array<string | number | boolean>) =>
  keccak256(stringToHex(parts.map((p) => String(p)).join("|")));


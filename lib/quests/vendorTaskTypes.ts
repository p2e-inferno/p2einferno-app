import type { TaskType } from "@/lib/supabase/types";

export const VENDOR_TX_TASK_TYPES = [
  "vendor_buy",
  "vendor_sell",
  "vendor_light_up",
] as const satisfies readonly TaskType[];

export const VENDOR_BLOCKCHAIN_TASK_TYPES = [
  ...VENDOR_TX_TASK_TYPES,
  "vendor_level_up",
] as const satisfies readonly TaskType[];

export type VendorTxTaskType = (typeof VENDOR_TX_TASK_TYPES)[number];
export type VendorBlockchainTaskType =
  (typeof VENDOR_BLOCKCHAIN_TASK_TYPES)[number];

export function isVendorTxTaskType(
  taskType: TaskType,
): taskType is VendorTxTaskType {
  return VENDOR_TX_TASK_TYPES.includes(taskType as VendorTxTaskType);
}

export function isVendorBlockchainTaskType(
  taskType: TaskType,
): taskType is VendorBlockchainTaskType {
  return VENDOR_BLOCKCHAIN_TASK_TYPES.includes(
    taskType as VendorBlockchainTaskType,
  );
}

/**
 * All task types that require a transaction hash for verification and
 * replay prevention. Used by both the complete-task API (for replay
 * registration) and TaskItem UI (for the tx-hash input field).
 */
export const TX_HASH_REQUIRED_TASK_TYPES = [
  ...VENDOR_TX_TASK_TYPES,
  "deploy_lock",
  "uniswap_swap",
] as const satisfies readonly TaskType[];

export type TxHashRequiredTaskType =
  (typeof TX_HASH_REQUIRED_TASK_TYPES)[number];

export function isTxHashRequiredTaskType(
  taskType: TaskType,
): taskType is TxHashRequiredTaskType {
  return TX_HASH_REQUIRED_TASK_TYPES.includes(
    taskType as TxHashRequiredTaskType,
  );
}

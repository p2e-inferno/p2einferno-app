import { CHAIN_ID } from "@/lib/blockchain/config";
import { normalizeTransactionHash } from "@/lib/quests/tx-hash";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("quests:replay-prevention");

export interface QuestTransactionMetadata {
  amount?: string | null;
  eventName?: string | null;
  blockNumber?: string | number | null;
  logIndex?: number | null;
}

export async function registerQuestTransaction(
  supabase: ReturnType<
    typeof import("@/lib/supabase/server").createAdminClient
  >,
  params: {
    txHash: string;
    userId: string;
    taskId: string;
    taskType: string;
    metadata?: QuestTransactionMetadata;
  },
): Promise<{
  success: boolean;
  error?: string;
  kind?: "conflict" | "rpc_error";
  alreadyRegistered?: boolean;
}> {
  const normalizedTxHash = normalizeTransactionHash(params.txHash);
  const metadata = params.metadata || {};
  const blockNumber =
    typeof metadata.blockNumber === "string"
      ? Number(metadata.blockNumber)
      : typeof metadata.blockNumber === "number"
        ? metadata.blockNumber
        : null;

  const { data, error } = await supabase.rpc("register_quest_transaction", {
    p_tx_hash: normalizedTxHash,
    p_chain_id: CHAIN_ID,
    p_user_id: params.userId,
    p_task_id: params.taskId,
    p_task_type: params.taskType,
    p_verified_amount: metadata.amount ?? null,
    p_event_name: metadata.eventName ?? null,
    p_block_number:
      typeof blockNumber === "number" && Number.isFinite(blockNumber)
        ? blockNumber
        : null,
    p_log_index:
      typeof metadata.logIndex === "number" ? metadata.logIndex : null,
  });

  if (error) {
    log.error("register_quest_transaction failed", {
      error,
      txHash: normalizedTxHash,
    });
    return { success: false, error: error.message, kind: "rpc_error" };
  }

  if (data?.success === false) {
    return { success: false, error: data?.error, kind: "conflict" };
  }

  return {
    success: true,
    alreadyRegistered: data?.already_registered === true,
  };
}

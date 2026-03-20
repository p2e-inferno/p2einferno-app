import type { VendorTaskConfig } from "@/lib/quests/vendor-task-config";
import type { DeployLockTaskConfig } from "@/lib/quests/verification/deploy-lock-utils";
import type { SwapDirection, SwapPair } from "@/lib/uniswap/types";

export type WalletMatchMode = "active_only" | "any_linked";

export interface AIVerificationTaskConfig {
  ai_verification_prompt?: string;
  ai_model?: string;
  ai_prompt_required?: boolean;
  ai_confidence_threshold?: number | string;
  wallet_match_mode?: WalletMatchMode;
}

export interface UniswapTaskConfig {
  pair?: SwapPair;
  direction?: SwapDirection;
  required_amount_in?: string;
}

export type QuestTaskConfig = Record<string, unknown> &
  Partial<VendorTaskConfig> &
  Partial<Pick<DeployLockTaskConfig, "allowed_networks">> &
  Partial<AIVerificationTaskConfig> &
  Partial<UniswapTaskConfig>;

export function asQuestTaskConfig(value: unknown): QuestTaskConfig | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as QuestTaskConfig;
}

export function getTaskConfigString(
  config: QuestTaskConfig | null,
  key: keyof QuestTaskConfig,
): string {
  const value = config?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function getTaskConfigBoolean(
  config: QuestTaskConfig | null,
  key: keyof QuestTaskConfig,
): boolean {
  return typeof config?.[key] === "boolean" ? Boolean(config[key]) : false;
}

export function getTaskConfigNumber(
  config: QuestTaskConfig | null,
  key: keyof QuestTaskConfig,
  fallback: number,
): number {
  const raw = config?.[key];
  const parsed =
    typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getWalletMatchMode(
  config: QuestTaskConfig | null,
): WalletMatchMode {
  return config?.wallet_match_mode === "any_linked"
    ? "any_linked"
    : "active_only";
}

function parseBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return undefined;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0") return false;
  }
  return undefined;
}

export function normalizeQuestTaskConfig(value: unknown): QuestTaskConfig | null {
  const config = asQuestTaskConfig(value);
  if (!config) return null;

  const normalized: QuestTaskConfig = { ...config };

  const prompt = getTaskConfigString(config, "ai_verification_prompt");
  if (prompt) normalized.ai_verification_prompt = prompt;
  else delete normalized.ai_verification_prompt;

  const model = getTaskConfigString(config, "ai_model");
  if (model) normalized.ai_model = model;
  else delete normalized.ai_model;

  const promptRequired = parseBooleanLike(config.ai_prompt_required);
  if (promptRequired === undefined) delete normalized.ai_prompt_required;
  else normalized.ai_prompt_required = promptRequired;

  const threshold = getTaskConfigNumber(config, "ai_confidence_threshold", NaN);
  if (Number.isFinite(threshold)) {
    normalized.ai_confidence_threshold = Math.min(1, Math.max(0, threshold));
  } else {
    delete normalized.ai_confidence_threshold;
  }

  if (
    config.wallet_match_mode === "active_only" ||
    config.wallet_match_mode === "any_linked"
  ) {
    normalized.wallet_match_mode = config.wallet_match_mode;
  } else {
    delete normalized.wallet_match_mode;
  }

  return normalized;
}

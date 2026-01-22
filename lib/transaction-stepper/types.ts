export type StepPhase =
  | "idle"
  | "awaiting_wallet"
  | "submitted"
  | "confirming"
  | "success"
  | "skipped"
  | "error";

export type TxResult = {
  transactionHash?: string;
  transactionUrl?: string;
  receipt?: unknown;
  waitForConfirmation?: () => Promise<TxResult | void>;
  data?: Record<string, unknown>;
};

export type DeploymentStep = {
  id: string;
  title: string;
  description?: string;
  canSkipOnError?: boolean;
  skipLabel?: string;
  execute: () => Promise<TxResult>;
};

export type StepRuntimeState = {
  id: string;
  title: string;
  description?: string;
  canSkipOnError?: boolean;
  skipLabel?: string;
  phase: StepPhase;
  transactionHash?: string;
  transactionUrl?: string;
  errorMessage?: string;
  startedAt?: number;
  endedAt?: number;
  result?: TxResult;
};

export type DeploymentFlowConfig = {
  entityType: "bootcamp" | "cohort" | "quest" | "milestone";
  title: string;
  description?: string;
  steps: DeploymentStep[];
};

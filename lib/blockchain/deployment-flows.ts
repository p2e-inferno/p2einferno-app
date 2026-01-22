import type {
  DeploymentFlowConfig,
  DeploymentStep,
  TxResult,
} from "@/lib/transaction-stepper/types";

type BuildFlowArgs = {
  title: string;
  description?: string;
  executeDeployment?: () => Promise<TxResult>;
  steps?: DeploymentStep[];
};

function buildSingleStepFlow(
  entityType: DeploymentFlowConfig["entityType"],
  args: BuildFlowArgs,
): DeploymentFlowConfig {
  if (args.steps) {
    return {
      entityType,
      title: args.title,
      description:
        "Follow the steps below to complete the on-chain deployment.",
      steps: args.steps,
    };
  }

  if (!args.executeDeployment) {
    throw new Error("Deployment flow requires either steps or executeDeployment");
  }

  const step: DeploymentStep = {
    id: `${entityType}:deploy_lock`,
    title: "Deploy & configure lock",
    description:
      args.description ??
      "This deployment may require multiple wallet confirmations and on-chain confirmations.",
    execute: args.executeDeployment,
  };

  return {
    entityType,
    title: args.title,
    description: "Follow the steps below to complete the on-chain deployment.",
    steps: [step],
  };
}

export function buildBootcampDeploymentFlow(
  args: BuildFlowArgs,
): DeploymentFlowConfig {
  return buildSingleStepFlow("bootcamp", args);
}

export function buildCohortDeploymentFlow(
  args: BuildFlowArgs,
): DeploymentFlowConfig {
  return buildSingleStepFlow("cohort", args);
}

export function buildQuestDeploymentFlow(
  args: BuildFlowArgs,
): DeploymentFlowConfig {
  return buildSingleStepFlow("quest", args);
}

export function buildMilestoneDeploymentFlow(
  args: BuildFlowArgs,
): DeploymentFlowConfig {
  return buildSingleStepFlow("milestone", args);
}

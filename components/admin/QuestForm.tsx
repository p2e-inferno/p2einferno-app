import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import ImageUpload from "@/components/ui/image-upload";
import QuestTaskForm from "@/components/admin/QuestTaskForm";
import Toggle from "@/components/ui/toggle";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useSmartWalletSelection } from "../../hooks/useSmartWalletSelection";
import { PlusCircle, Coins, Save, X, Shield } from "lucide-react";
import { toast } from "react-hot-toast";
import { showInfoToast } from "@/lib/utils/toast-utils";
import {
  generateQuestLockConfig,
  createLockConfigWithManagers,
} from "@/lib/blockchain/legacy";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";
import {
  saveDraft,
  removeDraft,
  getDraft,
  updateDraftWithDeploymentResult,
  savePendingDeployment,
} from "@/lib/utils/lock-deployment-state";
import { resolveDraftById } from "@/lib/utils/draft";
import type { Quest, QuestTask } from "@/lib/supabase/types";
import { nanoid } from "nanoid";
import { getLogger } from "@/lib/utils/logger";
import { useDeployAdminLock } from "@/hooks/unlock/useDeployAdminLock";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { convertLockConfigToDeploymentParams } from "@/lib/blockchain/shared/lock-config-converter";
import {
  applyDeploymentOutcome,
  effectiveGrantForSave,
  effectiveMaxKeysForSave,
  effectiveTransferabilityForSave,
} from "@/lib/blockchain/shared/grant-state";
import LockManagerToggle from "@/components/admin/LockManagerToggle";
import { useLockManagerState } from "@/hooks/useLockManagerState";
import { useMaxKeysSecurityState } from "@/hooks/useMaxKeysSecurityState";
import { useTransferabilitySecurityState } from "@/hooks/useTransferabilitySecurityState";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import type { Address } from "viem";
import { TransactionStepperModal } from "@/components/admin/TransactionStepperModal";
import { useTransactionStepper } from "@/hooks/useTransactionStepper";
import { buildQuestDeploymentFlow } from "@/lib/blockchain/deployment-flows";
import type { DeploymentStep } from "@/lib/transaction-stepper/types";

const log = getLogger("admin:QuestForm");

const DEFAULT_DG_TRIAL_DURATION_SECONDS = 7 * 24 * 60 * 60;

interface QuestFormProps {
  quest?: Quest;
  isEditing?: boolean;
}

type TaskWithTempId = Partial<QuestTask> & { tempId?: string };

/**
 * Display and manage a form for creating or editing a Quest, handling tasks, prerequisites, reward/activation configuration, optional automatic lock deployment, draft restoration, validation, and saving to the admin API.
 *
 * @param props.quest - Optional existing quest used to populate the form when editing.
 * @param props.isEditing - Whether the form is in edit mode (default: false).
 * @returns A JSX form element that manages quest state, optional lock deployment, and persistence to the admin API.
 */
export default function QuestForm({
  quest,
  isEditing = false,
}: QuestFormProps) {
  const router = useRouter();
  const { adminFetch } = useAdminApi();
  const { adminFetch: silentFetch } = useAdminApi({ suppressToasts: true });
  const wallet = useSmartWalletSelection();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isAdmin } = useAdminAuthContext();
  const { createAdminLockDeploymentSteps } = useDeployAdminLock({ isAdmin });
  const { checkIsLockManager } = useIsLockManager();

  // Stepper modal state (multi-transaction deployment UX)
  const [isStepperOpen, setIsStepperOpen] = useState(false);
  const [stepperTitle, setStepperTitle] = useState("Deploy quest lock");
  const [deploymentSteps, setDeploymentSteps] = useState<DeploymentStep[]>([]);
  const stepperDecisionResolverRef = useRef<
    ((decision: "retry" | "cancel" | "skip") => void) | null
  >(null);
  const [showAutoLockCreation, setShowAutoLockCreation] = useState(true);
  const draftScopeKey = "global";
  // Use the reusable hook for lock manager state management
  const {
    lockManagerGranted,
    setLockManagerGranted,
    grantFailureReason,
    setGrantFailureReason,
  } = useLockManagerState(isEditing, quest);

  const {
    maxKeysSecured,
    setMaxKeysSecured,
    maxKeysFailureReason,
    setMaxKeysFailureReason,
  } = useMaxKeysSecurityState(isEditing, quest);
  const {
    transferabilitySecured,
    setTransferabilitySecured,
    transferabilityFailureReason,
    setTransferabilityFailureReason,
  } = useTransferabilitySecurityState(isEditing, quest);
  const [serverWalletAddress, setServerWalletAddress] = useState<string | null>(
    null,
  );
  const [activationManagerStatus, setActivationManagerStatus] = useState<
    boolean | null
  >(null);
  const [activationManagerError, setActivationManagerError] = useState<
    string | null
  >(null);

  // Track the most recent grant/config outcomes during submit to avoid async state races
  const deploymentOutcomeRef = useRef<{
    grantFailed?: boolean;
    grantError?: string;
    configFailed?: boolean;
    configError?: string;
    transferFailed?: boolean;
    transferError?: string;
  }>({});

  const [formData, setFormData] = useState({
    title: quest?.title || "",
    description: quest?.description || "",
    image_url: quest?.image_url || "",
    is_active: quest?.is_active ?? true,
    lock_address: quest?.lock_address || "",
    // New fields for prerequisites and activation
    prerequisite_quest_id: quest?.prerequisite_quest_id || "",
    prerequisite_quest_lock_address:
      quest?.prerequisite_quest_lock_address || "",
    requires_prerequisite_key: quest?.requires_prerequisite_key || false,
    reward_type: quest?.reward_type || "xdg",
    activation_type: quest?.activation_type || "",
    activation_config: quest?.activation_config || null,
    requires_gooddollar_verification:
      quest?.requires_gooddollar_verification || false,
  });
  const formDataRef = useRef(formData);
  useEffect(() => {
    formDataRef.current = formData;
  }, [formData]);

  const questDeploymentFlow = useMemo(
    () =>
      buildQuestDeploymentFlow({
        title: "Deploy quest lock",
        description:
          "Deploys the quest completion lock and applies required configuration.",
        steps: deploymentSteps,
      }),
    [deploymentSteps],
  );
  const {
    state: stepperState,
    start: stepperStart,
    retryStep: stepperRetry,
    skipStep: stepperSkip,
    waitForSteps: stepperWaitForSteps,
    cancel: stepperCancel,
  } = useTransactionStepper(questDeploymentFlow.steps);
  const isDeploying = stepperState.isRunning;
  const handleStepperRetry = useCallback(() => {
    if (stepperDecisionResolverRef.current) {
      stepperDecisionResolverRef.current("retry");
      stepperDecisionResolverRef.current = null;
    }
  }, []);
  const handleStepperSkip = useCallback(() => {
    if (stepperDecisionResolverRef.current) {
      stepperDecisionResolverRef.current("skip");
      stepperDecisionResolverRef.current = null;
    }
  }, []);
  const handleStepperCancel = useCallback(() => {
    if (stepperDecisionResolverRef.current) {
      stepperDecisionResolverRef.current("cancel");
      stepperDecisionResolverRef.current = null;
      return;
    }
    stepperCancel();
    setIsStepperOpen(false);
  }, [stepperCancel]);
  const handleStepperClose = useCallback(() => {
    if (!stepperState.canClose) return;
    if (stepperDecisionResolverRef.current) {
      stepperDecisionResolverRef.current("cancel");
      stepperDecisionResolverRef.current = null;
      return;
    }
    setIsStepperOpen(false);
  }, [stepperState.canClose]);
  const activationLockAddress = useMemo(
    () => (formData.activation_config as any)?.lockAddress || "",
    [formData.activation_config],
  );

  // Load draft data on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isEditing) return;

    const draft = getDraft("quest", draftScopeKey);
    if (!draft) return;

    let cancelled = false;

    const hydrateDraft = (showRestoreToast: boolean = true) => {
      if (draft.formData?.questData && draft.formData.tasks) {
        setFormData((prev) => ({ ...prev, ...draft.formData.questData }));
        setTasks(draft.formData.tasks);

        if (draft.formData.questData.lock_manager_granted === false) {
          setLockManagerGranted(false);
          setGrantFailureReason(draft.formData.questData.grant_failure_reason);
        }

        if (showRestoreToast) {
          if (draft.formData.questData.lock_address) {
            setShowAutoLockCreation(false);
            toast.success("Restored draft data with deployed lock and tasks");
          } else {
            toast.success("Restored draft data with tasks");
          }
        }
      } else {
        setFormData((prev) => ({ ...prev, ...draft.formData }));

        if (draft.formData?.lock_manager_granted === false) {
          setLockManagerGranted(false);
          setGrantFailureReason(draft.formData.grant_failure_reason);
        }

        if (showRestoreToast) {
          if (draft.formData?.lock_address) {
            setShowAutoLockCreation(false);
            toast.success("Restored draft data with deployed lock");
          } else {
            toast.success("Restored draft data");
          }
        }
      }
    };

    const fetchExisting = async (id: string) => {
      const response = await silentFetch<{ quest: Quest }>(
        `/api/admin/quests/${id}`,
      );
      if (response.error) {
        return null;
      }
      return response.data?.quest ?? null;
    };

    const resolveDraft = async () => {
      const hadDraftId = Boolean(draft.formData?.id);
      const resolution = await resolveDraftById({
        draft,
        fetchExisting,
      });

      if (cancelled) return;

      if (resolution.mode === "existing") {
        removeDraft("quest", draftScopeKey);
        toast.success("Draft already saved — redirecting to quest editor.");
        router.replace(`/admin/quests/${resolution.draftId}/edit`);
        return;
      }

      if (hadDraftId) {
        showInfoToast(
          "Saved quest not found — continuing with draft as a new quest.",
        );
      }

      hydrateDraft(!hadDraftId);
    };

    resolveDraft();

    return () => {
      cancelled = true;
    };
  }, [isEditing, adminFetch, silentFetch, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    const fetchServerWallet = async () => {
      if (serverWalletAddress) return;
      try {
        const result = await adminFetch<{ serverWalletAddress: string }>(
          "/api/admin/server-wallet",
        );
        if (cancelled) return;
        if (result.data?.serverWalletAddress) {
          setServerWalletAddress(result.data.serverWalletAddress);
        }
      } catch (err) {
        if (!cancelled) {
          log.error("Failed to fetch server wallet address:", err);
        }
      }
    };

    fetchServerWallet();

    return () => {
      cancelled = true;
    };
  }, [adminFetch, serverWalletAddress]);

  useEffect(() => {
    let cancelled = false;

    const checkManagerStatus = async () => {
      if (
        formData.reward_type !== "activation" ||
        formData.activation_type !== "dg_trial" ||
        !activationLockAddress ||
        !serverWalletAddress
      ) {
        setActivationManagerStatus(null);
        setActivationManagerError(null);
        return;
      }

      try {
        const isManager = await checkIsLockManager(
          serverWalletAddress as Address,
          activationLockAddress as Address,
        );
        if (!cancelled) {
          setActivationManagerStatus(isManager);
          setActivationManagerError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          log.error("Failed to check activation lock manager status:", err);
          setActivationManagerStatus(null);
          setActivationManagerError(
            err?.message || "Failed to check lock manager status",
          );
        }
      }
    };

    checkManagerStatus();

    return () => {
      cancelled = true;
    };
  }, [
    formData.reward_type,
    formData.activation_type,
    activationLockAddress,
    serverWalletAddress,
    checkIsLockManager,
  ]);

  // Ensure required nested activation defaults exist in state (draft recovery can restore partial config)
  useEffect(() => {
    if (
      formData.reward_type !== "activation" ||
      formData.activation_type !== "dg_trial"
    ) {
      return;
    }

    setFormData((prev) => {
      const config = (prev.activation_config as any) || {};
      const rawTrial = config.trialDurationSeconds;
      const trialSeconds =
        rawTrial === undefined || rawTrial === null || rawTrial === ""
          ? DEFAULT_DG_TRIAL_DURATION_SECONDS
          : Number(rawTrial);

      if (Number.isFinite(trialSeconds) && trialSeconds > 0) {
        return prev;
      }

      return {
        ...prev,
        activation_config: {
          ...(prev.activation_config || {}),
          trialDurationSeconds: DEFAULT_DG_TRIAL_DURATION_SECONDS,
        },
      };
    });
  }, [formData.reward_type, formData.activation_type]);

  const [tasks, setTasks] = useState<TaskWithTempId[]>(() => {
    if (quest?.quest_tasks) {
      return quest.quest_tasks.map((task, index) => ({
        ...task,
        tempId: `existing-${task.id}`,
        order_index: index,
      }));
    }
    return [];
  });

  const [prerequisiteOptions, setPrerequisiteOptions] = useState<Quest[]>([]);
  const [loadingPrerequisites, setLoadingPrerequisites] = useState(false);
  const [prerequisiteOptionsError, setPrerequisiteOptionsError] = useState<
    string | null
  >(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPrerequisiteOptions = async () => {
      setLoadingPrerequisites(true);
      setPrerequisiteOptionsError(null);

      const response = await silentFetch<{
        data?: Quest[];
        success?: boolean;
      }>("/api/admin/quests-v2");

      if (cancelled) {
        return;
      }

      setLoadingPrerequisites(false);

      if (response.error) {
        setPrerequisiteOptionsError("Failed to load prerequisite quests");
        return;
      }

      const result = response.data;
      const questsList = Array.isArray(result?.data) ? result?.data : [];
      const filtered = questsList.filter((item: any) => item?.id !== quest?.id);
      setPrerequisiteOptions(filtered as Quest[]);
    };

    fetchPrerequisiteOptions();

    return () => {
      cancelled = true;
    };
  }, [silentFetch, quest?.id]);

  const selectedPrerequisiteQuest = useMemo(() => {
    if (!formData.prerequisite_quest_id) {
      return undefined;
    }
    return prerequisiteOptions.find(
      (option) => option.id === formData.prerequisite_quest_id,
    );
  }, [formData.prerequisite_quest_id, prerequisiteOptions]);

  const isPrerequisiteSelectionInvalid = Boolean(
    selectedPrerequisiteQuest && !selectedPrerequisiteQuest.lock_address,
  );

  const handlePrerequisiteQuestChange = (value: string) => {
    const selected = prerequisiteOptions.find((option) => option.id === value);
    setFormData((prev) => ({
      ...prev,
      prerequisite_quest_id: value,
      prerequisite_quest_lock_address:
        value === ""
          ? prev.prerequisite_quest_lock_address
          : selected?.lock_address || "",
    }));
  };

  const totalReward = tasks.reduce(
    (sum, task) => sum + (task.reward_amount || 0),
    0,
  );

  const handleAddTask = () => {
    const newTask: TaskWithTempId = {
      tempId: nanoid(),
      title: "",
      description: "",
      task_type: "submit_url",
      verification_method: "manual_review",
      reward_amount: 1000,
      order_index: tasks.length,
      input_required: true,
      requires_admin_review: true,
    };
    setTasks([...tasks, newTask]);
  };

  const handleUpdateTask = (index: number, updatedTask: TaskWithTempId) => {
    const newTasks = [...tasks];
    newTasks[index] = { ...updatedTask, order_index: index };
    setTasks(newTasks);
  };

  const handleRemoveTask = (index: number) => {
    const newTasks = tasks.filter((_, i) => i !== index);
    // Update order_index for remaining tasks
    const reorderedTasks = newTasks.map((task, i) => ({
      ...task,
      order_index: i,
    }));
    setTasks(reorderedTasks);
  };

  const handleMoveTask = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === tasks.length - 1)
    ) {
      return;
    }

    const newTasks = [...tasks];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    // Ensure both indices are valid
    if (targetIndex < 0 || targetIndex >= newTasks.length) return;

    // Swap tasks
    const temp = newTasks[index];
    const target = newTasks[targetIndex];
    if (temp && target) {
      newTasks[index] = target;
      newTasks[targetIndex] = temp;
    }

    // Update order_index
    const reorderedTasks = newTasks.map((task, i) => ({
      ...task,
      order_index: i,
    }));

    setTasks(reorderedTasks);
  };

  // Deploy lock for the quest
  const deployLockForQuest = async (): Promise<
    | {
        lockAddress: string;
        grantFailed?: boolean;
        grantError?: string;
      }
    | undefined
  > => {
    try {
      if (!wallet) {
        throw new Error("Please connect your wallet to deploy the lock");
      }
      if (!formDataRef.current?.title) {
        throw new Error("Please enter quest title before deploying lock");
      }

      const questData = {
        ...formDataRef.current,
        total_reward: totalReward,
      } as Quest;
      const lockConfig = generateQuestLockConfig(questData);
      const deployConfig = createLockConfigWithManagers(lockConfig);
      const params = convertLockConfigToDeploymentParams(deployConfig, isAdmin);
      const { steps, getResult } = createAdminLockDeploymentSteps(params);
      setDeploymentSteps(steps);
      setStepperTitle(
        formDataRef.current?.title
          ? `Deploy lock for ${formDataRef.current.title}`
          : "Deploy quest lock",
      );
      setIsStepperOpen(true);
      await stepperWaitForSteps(steps.length);

      try {
        await stepperStart();
      } catch (err: any) {
        while (true) {
          const decision = await new Promise<"retry" | "cancel" | "skip">(
            (resolve) => {
              stepperDecisionResolverRef.current = resolve;
            },
          );
          stepperDecisionResolverRef.current = null;

          if (decision === "cancel") {
            stepperCancel();
            setIsStepperOpen(false);
            throw err;
          }

          if (decision === "skip") {
            try {
              await stepperSkip();
              break;
            } catch (skipErr) {
              err = skipErr;
              continue;
            }
          }

          try {
            await stepperRetry();
            break;
          } catch (retryErr) {
            err = retryErr;
            continue;
          }
        }
      }

      setIsStepperOpen(false);

      const deploymentResult = getResult();
      const lockAddress: string | undefined = deploymentResult?.lockAddress;
      if (!deploymentResult?.success || !lockAddress) {
        throw new Error("Lock deployment failed");
      }

      const outcome = applyDeploymentOutcome(deploymentResult);
      setLockManagerGranted(outcome.granted);
      setGrantFailureReason(outcome.reason);
      deploymentOutcomeRef.current.grantFailed = outcome.lastGrantFailed;
      deploymentOutcomeRef.current.grantError = outcome.lastGrantError;

      setMaxKeysSecured(!deploymentResult.configFailed);
      setMaxKeysFailureReason(deploymentResult.configError);
      deploymentOutcomeRef.current.configFailed = deploymentResult.configFailed;
      deploymentOutcomeRef.current.configError = deploymentResult.configError;

      setTransferabilitySecured(!deploymentResult.transferConfigFailed);
      setTransferabilityFailureReason(deploymentResult.transferConfigError);
      deploymentOutcomeRef.current.transferFailed =
        deploymentResult.transferConfigFailed;
      deploymentOutcomeRef.current.transferError =
        deploymentResult.transferConfigError;

      updateDraftWithDeploymentResult("quest", draftScopeKey, {
        lockAddress,
        grantFailed: deploymentResult.grantFailed,
        grantError: deploymentResult.grantError,
      });

      savePendingDeployment({
        lockAddress,
        entityType: "quest",
        entityData: {
          ...formDataRef.current,
          total_reward: totalReward,
          tasks: tasks.filter((task) => task.title && task.title.trim()),
        },
        transactionHash: deploymentResult.transactionHash,
        grantTransactionHash: deploymentResult.grantTransactionHash,
        serverWalletAddress: deploymentResult.serverWalletAddress,
        blockExplorerUrl: deploymentResult.transactionHash
          ? getBlockExplorerUrl(deploymentResult.transactionHash)
          : undefined,
      });

      if (deploymentResult.grantFailed) {
        toast(
          <>
            Lock deployed successfully!
            <br />
            ⚠️ Grant manager role failed - you can retry from quest details
            page.
            <br />
            {deploymentResult.transactionHash && (
              <a
                href={getBlockExplorerUrl(deploymentResult.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View deployment
              </a>
            )}
          </>,
          { duration: 8000, icon: "⚠️" },
        );
      } else {
        toast.success(
          <>
            Lock deployed successfully!
            <br />
            {deploymentResult.transactionHash && (
              <a
                href={getBlockExplorerUrl(deploymentResult.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View deployment
              </a>
            )}
          </>,
          { duration: 5000 },
        );
      }

      return {
        lockAddress,
        grantFailed: deploymentResult.grantFailed,
        grantError: deploymentResult.grantError,
      };
    } catch (error: any) {
      log.error("Lock deployment failed:", error);
      throw error;
    }
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError("Quest title is required");
      return false;
    }

    if (!formData.description.trim()) {
      setError("Quest description is required");
      return false;
    }

    if (tasks.length === 0) {
      setError("At least one task is required");
      return false;
    }

    // Validate each task
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task || !task.title?.trim()) {
        setError(`Task ${i + 1}: Title is required`);
        return false;
      }
      if (!task.description?.trim()) {
        setError(`Task ${i + 1}: Description is required`);
        return false;
      }
      if (!task.reward_amount || task.reward_amount < 0) {
        setError(`Task ${i + 1}: Valid reward amount is required`);
        return false;
      }
    }

    if (isPrerequisiteSelectionInvalid) {
      setError("Prerequisite quest must have a completion lock configured.");
      return false;
    }

    if (formData.reward_type === "activation") {
      if (!formData.activation_type) {
        setError("Activation type is required for activation quests");
        return false;
      }
      if (formData.activation_type === "dg_trial") {
        const lockAddress = String(
          (formData.activation_config as any)?.lockAddress || "",
        ).trim();
        if (!lockAddress) {
          setError("DG Nation Lock Address is required");
          return false;
        }

        const rawTrialSeconds = (formData.activation_config as any)
          ?.trialDurationSeconds;
        const trialDurationSeconds =
          rawTrialSeconds === undefined ||
          rawTrialSeconds === null ||
          rawTrialSeconds === ""
            ? DEFAULT_DG_TRIAL_DURATION_SECONDS
            : Number(rawTrialSeconds);
        if (
          !Number.isFinite(trialDurationSeconds) ||
          trialDurationSeconds <= 0
        ) {
          setError("Trial duration must be at least 1 day");
          return false;
        }
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    deploymentOutcomeRef.current = {};

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Save draft before starting deployment (for new quests)
      if (!isEditing) {
        saveDraft(
          "quest",
          {
            questData: { ...formData, total_reward: totalReward },
            tasks: tasks,
          },
          draftScopeKey,
        );
      }

      let lockAddress: string | undefined = formData.lock_address || undefined;

      // Deploy lock if not editing and auto-creation is enabled and no lock address provided
      if (
        !isEditing &&
        showAutoLockCreation &&
        !lockAddress &&
        totalReward > 0
      ) {
        try {
          log.info("Auto-deploying lock for quest...");
          const deploymentResult = await deployLockForQuest();

          if (!deploymentResult || !deploymentResult.lockAddress) {
            throw new Error("Lock deployment failed");
          }

          lockAddress = deploymentResult.lockAddress;

          // Track grant failure if it occurred
          if (deploymentResult.grantFailed) {
            setLockManagerGranted(false);
            setGrantFailureReason(
              deploymentResult.grantError || "Grant manager transaction failed",
            );
            log.warn("Quest will be created with grant failure flag", {
              lockAddress,
              grantError: deploymentResult.grantError,
            });
          }
        } catch (deployError: any) {
          // If lock deployment fails, don't create the quest
          throw new Error(`Lock deployment failed: ${deployError.message}`);
        }
      }

      const endpoint = isEditing
        ? `/api/admin/quests-v2/${quest?.id}`
        : "/api/admin/quests-v2";

      const method = isEditing ? "PUT" : "POST";

      // Remove UI-only fields from formData before sending to database
      const { auto_lock_creation, ...cleanFormData } =
        formData as typeof formData & {
          auto_lock_creation?: boolean;
        };

      // Prepare quest data using shared grant-state util
      const effective = effectiveGrantForSave({
        outcome: {
          lastGrantFailed: deploymentOutcomeRef.current.grantFailed,
          lastGrantError: deploymentOutcomeRef.current.grantError,
        },
        lockAddress,
        currentGranted: lockManagerGranted,
        currentReason: grantFailureReason,
      });

      const effectiveMaxKeys = effectiveMaxKeysForSave({
        outcome: {
          lastConfigFailed: deploymentOutcomeRef.current.configFailed,
          lastConfigError: deploymentOutcomeRef.current.configError,
        },
        lockAddress,
        currentSecured: maxKeysSecured,
        currentReason: maxKeysFailureReason,
      });

      const effectiveTransferability = effectiveTransferabilityForSave({
        outcome: {
          lastTransferFailed: deploymentOutcomeRef.current.transferFailed,
          lastTransferError: deploymentOutcomeRef.current.transferError,
        },
        lockAddress,
        currentSecured: transferabilitySecured,
        currentReason: transferabilityFailureReason,
      });

      // Only include max_keys fields when editing if there's a deployment outcome
      // Otherwise, omit them to preserve existing DB values (prevents overwriting synced state)
      const hasDeploymentOutcome =
        typeof deploymentOutcomeRef.current.configFailed === "boolean";
      const shouldIncludeMaxKeysFields = !isEditing || hasDeploymentOutcome;
      const hasTransferOutcome =
        typeof deploymentOutcomeRef.current.transferFailed === "boolean";
      const shouldIncludeTransferabilityFields =
        !isEditing || hasTransferOutcome;

      const questData: any = {
        ...cleanFormData,
        lock_address: lockAddress,
        total_reward: totalReward,
        lock_manager_granted: effective.granted,
        grant_failure_reason: effective.reason,
      };

      // DB safety: avoid sending empty strings for constrained columns.
      // - prerequisite_quest_id is UUID ("" => invalid uuid)
      // - activation_type has a CHECK constraint ("" => violates constraint)
      const sanitizedQuestData: any = {
        ...questData,
        prerequisite_quest_id: questData.prerequisite_quest_id || null,
        activation_type: questData.activation_type || null,
      };

      // Only include max_keys fields if creating new quest or if there was a deployment
      if (shouldIncludeMaxKeysFields) {
        sanitizedQuestData.max_keys_secured = effectiveMaxKeys.secured;
        sanitizedQuestData.max_keys_failure_reason = effectiveMaxKeys.reason;
      }

      if (shouldIncludeTransferabilityFields) {
        sanitizedQuestData.transferability_secured =
          effectiveTransferability.secured;
        sanitizedQuestData.transferability_failure_reason =
          effectiveTransferability.reason;
      }

      // Prepare tasks data
      const tasksData = tasks.map((task) => {
        const { tempId, ...taskData } = task;
        return {
          ...taskData,
          quest_id: quest?.id, // Will be set by API for new quests
        };
      });

      log.info("Submitting quest form", {
        mode: isEditing ? "edit" : "create",
        endpoint,
        method,
        questId: quest?.id ?? null,
        fields: {
          title: sanitizedQuestData.title,
          reward_type: sanitizedQuestData.reward_type,
          activation_type: sanitizedQuestData.activation_type,
          activation_config: sanitizedQuestData.activation_config,
          prerequisite_quest_id: sanitizedQuestData.prerequisite_quest_id,
          prerequisite_quest_lock_address:
            sanitizedQuestData.prerequisite_quest_lock_address,
          requires_prerequisite_key:
            sanitizedQuestData.requires_prerequisite_key,
          lock_address: sanitizedQuestData.lock_address,
          total_reward: sanitizedQuestData.total_reward,
        },
        derived: {
          totalRewardFromTasks: totalReward,
          tasksCount: tasksData.length,
        },
      });

      const result = await adminFetch(endpoint, {
        method,
        body: JSON.stringify({
          ...sanitizedQuestData,
          tasks: tasksData,
          xp_reward: sanitizedQuestData.total_reward, // Map field name for API
        }),
      });

      if (result.error) {
        throw new Error(result.error);
      }

      // Clean up drafts and pending deployments on success
      if (!isEditing) {
        removeDraft("quest", draftScopeKey);
        // Note: removePendingDeployment will be called by the recovery endpoint if used
      }

      toast.success(
        isEditing
          ? "Quest updated successfully!"
          : "Quest created successfully!",
      );

      // Redirect to quest details page
      if (result.data?.quest?.id) {
        router.push(`/admin/quests/${result.data.quest.id}`);
      } else {
        router.push("/admin/quests");
      }
    } catch (err: any) {
      log.error("Error saving quest:", err);
      setError(err.message || "Failed to save quest");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <TransactionStepperModal
        open={isStepperOpen}
        title={stepperTitle}
        description={questDeploymentFlow.description}
        steps={stepperState.steps}
        activeStepIndex={stepperState.activeStepIndex}
        canClose={stepperState.canClose}
        onRetry={handleStepperRetry}
        onSkip={handleStepperSkip}
        onCancel={handleStepperCancel}
        onClose={handleStepperClose}
      />
      <form onSubmit={handleSubmit} className="space-y-8">
        {error && (
          <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Quest Basic Info */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-6">
          <h2 className="text-xl font-bold text-white mb-4">
            Quest Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="title" className="text-white">
                Quest Title
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="e.g., Web3 Warrior Training"
                className="bg-transparent border-gray-700 text-gray-100"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description" className="text-white">
                Quest Description
              </Label>
              <RichTextEditor
                value={formData.description}
                onChange={(next) =>
                  setFormData({ ...formData, description: next })
                }
                placeholder="Describe the quest objectives and what users will learn..."
                className="border-gray-700"
                editorClassName="text-gray-100"
                minHeightClassName="min-h-[120px]"
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <ImageUpload
                value={formData.image_url}
                onChange={(url) =>
                  setFormData({ ...formData, image_url: url || "" })
                }
                disabled={isSubmitting}
                bucketName="quest-images"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="lock_address" className="text-white">
                  Completion Lock Address
                </Label>
                {!isEditing && !formData.lock_address && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="auto_lock_creation"
                      checked={showAutoLockCreation}
                      onChange={(e) =>
                        setShowAutoLockCreation(e.target.checked)
                      }
                      className="rounded border-gray-700 bg-transparent text-flame-yellow focus:ring-flame-yellow"
                    />
                    <Label
                      htmlFor="auto_lock_creation"
                      className="text-sm text-gray-300 cursor-pointer"
                    >
                      Auto-create lock
                    </Label>
                  </div>
                )}
              </div>

              <Input
                id="lock_address"
                name="lock_address"
                value={formData.lock_address}
                onChange={(e) =>
                  setFormData({ ...formData, lock_address: e.target.value })
                }
                placeholder={
                  showAutoLockCreation && !isEditing
                    ? "Will be auto-generated..."
                    : "e.g., 0x1234..."
                }
                className="bg-transparent border-gray-700 text-gray-100"
                disabled={(showAutoLockCreation && !isEditing) || isSubmitting}
              />

              {/* Lock Manager Status Toggle */}
              <LockManagerToggle
                isGranted={lockManagerGranted}
                onToggle={setLockManagerGranted}
                lockAddress={formData.lock_address}
                isEditing={isEditing}
              />

              {showAutoLockCreation &&
                !isEditing &&
                !formData.lock_address &&
                totalReward > 0 && (
                  <p className="text-sm text-blue-400 mt-1">
                    ✨ A new completion lock will be automatically deployed for
                    this quest using your connected wallet
                  </p>
                )}

              {!showAutoLockCreation && (
                <p className="text-sm text-gray-400 mt-1">
                  Unlock Protocol lock address for quest completion certificates
                </p>
              )}
            </div>

            <div className="md:col-span-2 flex items-center justify-between">
              <Label className="text-white">Quest is Active</Label>
              <Toggle
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
                disabled={isSubmitting}
                ariaLabel="Quest is Active"
              />
            </div>

            {/* GoodDollar Verification Requirement */}
            <div className="md:col-span-2 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-400" />
                  <Label className="text-white">
                    Requires Gooddollar Verification
                  </Label>
                </div>
                <p className="text-sm text-gray-400 mt-1 ml-6">
                  Users must complete GoodDollar verification to participate in
                  this quest.
                </p>
              </div>
              <div className="ml-4">
                <Toggle
                  checked={formData.requires_gooddollar_verification}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      requires_gooddollar_verification: checked,
                    })
                  }
                  disabled={isSubmitting}
                  ariaLabel="Requires Gooddollar Verification"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Quest Prerequisites */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-6">
          <h2 className="text-xl font-bold text-white mb-4">
            Quest Prerequisites (Optional)
          </h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prerequisite_quest_id" className="text-white">
                Prerequisite Quest
              </Label>
              <select
                id="prerequisite_quest_id"
                value={formData.prerequisite_quest_id}
                onChange={(e) => handlePrerequisiteQuestChange(e.target.value)}
                className="w-full bg-transparent border border-gray-700 text-gray-100 rounded-md px-3 py-2"
                disabled={isSubmitting || loadingPrerequisites}
              >
                <option value="" className="bg-gray-900 text-gray-300">
                  No prerequisite quest
                </option>
                {prerequisiteOptions.map((option) => (
                  <option
                    key={option.id}
                    value={option.id}
                    className="bg-gray-900"
                  >
                    {option.title}
                    {!option.lock_address ? " (missing lock)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-400">
                Select an existing quest that must be completed before this
                quest.
              </p>
              {loadingPrerequisites && (
                <p className="text-sm text-gray-500">Loading quests...</p>
              )}
              {prerequisiteOptionsError && (
                <p className="text-sm text-red-400">
                  {prerequisiteOptionsError}
                </p>
              )}
              {isPrerequisiteSelectionInvalid && (
                <p className="text-sm text-red-400">
                  Selected quest is missing a lock address. Update that quest or
                  choose a different prerequisite.
                </p>
              )}
            </div>

            {formData.prerequisite_quest_id ? (
              <>
                <div className="space-y-2">
                  <Label
                    htmlFor="prerequisite_quest_lock_address"
                    className="text-white"
                  >
                    Prerequisite Lock Address
                  </Label>
                  <Input
                    id="prerequisite_quest_lock_address"
                    value={formData.prerequisite_quest_lock_address}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        prerequisite_quest_lock_address: e.target.value,
                      })
                    }
                    placeholder="0x..."
                    className="bg-transparent border-gray-700 text-gray-100"
                    disabled={isSubmitting}
                  />
                  <p className="text-sm text-gray-400">
                    Lock address users must have completed (first-class on-chain
                    reference)
                  </p>
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="requires_prerequisite_key"
                    checked={formData.requires_prerequisite_key}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        requires_prerequisite_key: e.target.checked,
                      })
                    }
                    className="rounded border-gray-700 bg-transparent text-flame-yellow focus:ring-flame-yellow"
                    disabled={isSubmitting}
                  />
                  <Label
                    htmlFor="requires_prerequisite_key"
                    className="text-white cursor-pointer"
                  >
                    Require Active Key (not just completion)
                  </Label>
                </div>
                <p className="text-sm text-gray-400 ml-7">
                  If checked, users must currently hold a valid key for the
                  prerequisite lock
                </p>
              </>
            ) : null}
          </div>
        </div>

        {/* Reward Type & Activation Config */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-6">
          <h2 className="text-xl font-bold text-white mb-4">
            Reward Configuration
          </h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reward_type" className="text-white">
                Reward Type
              </Label>
              <select
                id="reward_type"
                value={formData.reward_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    reward_type: e.target.value as "xdg" | "activation",
                    ...(e.target.value === "activation"
                      ? {}
                      : { activation_type: "", activation_config: null }),
                  })
                }
                className="w-full bg-transparent border border-gray-700 text-gray-100 rounded-md px-3 py-2"
                disabled={isSubmitting}
              >
                <option value="xdg" className="bg-gray-900">
                  xDG (Experience Points)
                </option>
                <option value="activation" className="bg-gray-900">
                  Activation (e.g., Membership Trial)
                </option>
              </select>
            </div>

            {formData.reward_type === "activation" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="activation_type" className="text-white">
                    Activation Type
                  </Label>
                  <select
                    id="activation_type"
                    value={formData.activation_type}
                    onChange={(e) =>
                      setFormData((prev) => {
                        const nextType = e.target.value;
                        if (!nextType) {
                          return {
                            ...prev,
                            activation_type: "",
                            activation_config: null,
                          };
                        }
                        if (nextType === "dg_trial") {
                          return {
                            ...prev,
                            activation_type: nextType,
                            activation_config: {
                              ...(prev.activation_config || {}),
                              trialDurationSeconds:
                                (prev.activation_config as any)
                                  ?.trialDurationSeconds ??
                                DEFAULT_DG_TRIAL_DURATION_SECONDS,
                            },
                          };
                        }
                        return { ...prev, activation_type: nextType };
                      })
                    }
                    className="w-full bg-transparent border border-gray-700 text-gray-100 rounded-md px-3 py-2"
                    disabled={isSubmitting}
                  >
                    <option value="" className="bg-gray-900">
                      Select activation type...
                    </option>
                    <option value="dg_trial" className="bg-gray-900">
                      DG Nation Trial
                    </option>
                  </select>
                </div>

                {formData.activation_type === "dg_trial" && (
                  <div className="space-y-4 p-4 bg-blue-900/10 border border-blue-700/30 rounded">
                    <p className="text-sm text-blue-300">
                      Configure DG Nation trial settings:
                    </p>

                    <div className="space-y-2">
                      <Label
                        htmlFor="activation_lock_address"
                        className="text-white"
                      >
                        DG Nation Lock Address *
                      </Label>
                      <Input
                        id="activation_lock_address"
                        value={
                          (formData.activation_config as any)?.lockAddress || ""
                        }
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            activation_config: {
                              ...(formData.activation_config || {}),
                              lockAddress: e.target.value,
                            },
                          })
                        }
                        placeholder="0x..."
                        className="bg-transparent border-gray-700 text-gray-100"
                        disabled={isSubmitting}
                      />
                      {activationLockAddress && (
                        <div className="rounded border border-slate-700 bg-slate-900 p-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">
                              Server wallet
                            </span>
                            <span className="text-slate-200">
                              {serverWalletAddress || "Loading..."}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">Lock manager</span>
                            <span
                              className={`font-medium ${
                                activationManagerStatus === null
                                  ? "text-yellow-400"
                                  : activationManagerStatus
                                    ? "text-green-400"
                                    : "text-red-400"
                              }`}
                            >
                              {activationManagerStatus === null
                                ? "Checking..."
                                : activationManagerStatus
                                  ? "Is Manager"
                                  : "Not Manager"}
                            </span>
                          </div>
                          {activationManagerError && (
                            <p className="mt-2 text-xs text-amber-300">
                              {activationManagerError}
                            </p>
                          )}
                          {activationManagerStatus === false && (
                            <p className="mt-2 text-xs text-amber-300">
                              Granting trials will fail until the server wallet
                              is added as a lock manager.
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="activation_trial_duration"
                        className="text-white"
                      >
                        Trial Duration (days) *
                      </Label>
                      <Input
                        id="activation_trial_duration"
                        type="number"
                        value={
                          ((formData.activation_config as any)
                            ?.trialDurationSeconds ||
                            DEFAULT_DG_TRIAL_DURATION_SECONDS) / 86400
                        }
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            activation_config: {
                              ...(formData.activation_config || {}),
                              trialDurationSeconds:
                                Math.max(0, parseInt(e.target.value, 10) || 0) *
                                86400,
                            },
                          })
                        }
                        placeholder="7"
                        min="1"
                        className="bg-transparent border-gray-700 text-gray-100"
                        disabled={isSubmitting}
                      />
                      <p className="text-sm text-gray-400">
                        Default: 7 days. Trial is one-time per user.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Quest Tasks */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Quest Tasks</h2>
            <Button
              type="button"
              onClick={handleAddTask}
              className="bg-steel-red hover:bg-steel-red/90 text-white"
              disabled={isSubmitting}
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>

          {tasks.length === 0 ? (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-8 text-center">
              <p className="text-gray-400 mb-4">No tasks added yet</p>
              <Button
                type="button"
                onClick={handleAddTask}
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Add First Task
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task, index) => (
                <QuestTaskForm
                  key={task.tempId || task.id}
                  task={task}
                  index={index}
                  onUpdate={(updatedTask) =>
                    handleUpdateTask(index, updatedTask)
                  }
                  onRemove={() => handleRemoveTask(index)}
                  onMoveUp={() => handleMoveTask(index, "up")}
                  onMoveDown={() => handleMoveTask(index, "down")}
                  canMoveUp={index > 0}
                  canMoveDown={index < tasks.length - 1}
                />
              ))}
            </div>
          )}

          {/* Total Reward Display */}
          {tasks.length > 0 && (
            <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-4 flex items-center justify-between">
              <span className="text-white font-semibold">
                Total Quest Reward
              </span>
              <div className="flex items-center text-yellow-400">
                <Coins className="w-5 h-5 mr-2" />
                <span className="text-xl font-bold">{totalReward} DG</span>
              </div>
            </div>
          )}
        </div>

        {/* Form Actions */}
        <div className="flex justify-end space-x-4 pt-6 border-t border-gray-800">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
            className="border-gray-700 text-gray-300 hover:bg-gray-800"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              isSubmitting || isDeploying || isPrerequisiteSelectionInvalid
            }
            className="bg-steel-red hover:bg-steel-red/90 text-white"
          >
            {isSubmitting || isDeploying ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
                {isDeploying ? "Deploying Lock..." : "Saving..."}
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isEditing ? "Update Quest" : "Create Quest"}
              </>
            )}
          </Button>
        </div>
      </form>
    </>
  );
}

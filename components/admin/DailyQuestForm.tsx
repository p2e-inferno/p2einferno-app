import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Toggle from "@/components/ui/toggle";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import ImageUpload from "@/components/ui/image-upload";
import { toast } from "react-hot-toast";
import { nanoid } from "nanoid";
import { PlusCircle, Save, X, Shield } from "lucide-react";
import { useAdminApi } from "@/hooks/useAdminApi";
import { getLogger } from "@/lib/utils/logger";
import { showInfoToast } from "@/lib/utils/toast-utils";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useDeployAdminLock } from "@/hooks/unlock/useDeployAdminLock";
import {
  generateQuestLockConfig,
  createLockConfigWithManagers,
} from "@/lib/blockchain/legacy";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";
import { convertLockConfigToDeploymentParams } from "@/lib/blockchain/shared/lock-config-converter";
import { TransactionStepperModal } from "@/components/admin/TransactionStepperModal";
import { useTransactionStepper } from "@/hooks/useTransactionStepper";
import { buildQuestDeploymentFlow } from "@/lib/blockchain/deployment-flows";
import type { DeploymentStep } from "@/lib/transaction-stepper/types";
import {
  applyDeploymentOutcome,
  effectiveGrantForSave,
  effectiveMaxKeysForSave,
  effectiveTransferabilityForSave,
} from "@/lib/blockchain/shared/grant-state";
import {
  saveDraft,
  removeDraft,
  getDraft,
  updateDraftWithDeploymentResult,
} from "@/lib/utils/lock-deployment-state";
import { resolveDraftById } from "@/lib/utils/draft";
import LockManagerToggle from "@/components/admin/LockManagerToggle";
import { useLockManagerState } from "@/hooks/useLockManagerState";
import { useMaxKeysSecurityState } from "@/hooks/useMaxKeysSecurityState";
import { useTransferabilitySecurityState } from "@/hooks/useTransferabilitySecurityState";
import { useAdminQuestOptions } from "@/hooks/useAdminQuestOptions";
import { DailyQuestTaskForm } from "@/components/admin/DailyQuestTaskForm";
import { getStageOptions } from "@/lib/blockchain/shared/vendor-constants";
import { isAddress } from "viem";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NetworkSelector } from "@/components/blockchain/NetworkSelector";

const log = getLogger("admin:DailyQuestForm");

export function DailyQuestForm(props: { dailyQuestId?: string }) {
  const router = useRouter();
  const { adminFetch } = useAdminApi();
  const { adminFetch: silentFetch } = useAdminApi({ suppressToasts: true });
  const wallet = useSmartWalletSelection();
  const { isAdmin } = useAdminAuthContext();
  const { createAdminLockDeploymentSteps } = useDeployAdminLock({ isAdmin });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(props.dailyQuestId));

  const [existingDailyQuest, setExistingDailyQuest] = useState<any>(null);
  const isEditing = Boolean(props.dailyQuestId);
  const draftEntityType = "daily_quest" as const;
  const draftScopeKey = "daily-quest:global";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [completionBonus, setCompletionBonus] = useState(0);

  const [lockAddress, setLockAddress] = useState<string>("");
  const [showAutoLockCreation, setShowAutoLockCreation] = useState(true);

  // Use the reusable hook for lock manager state management
  const {
    lockManagerGranted,
    setLockManagerGranted,
    grantFailureReason,
    setGrantFailureReason,
  } = useLockManagerState(isEditing, existingDailyQuest);

  const {
    maxKeysSecured,
    setMaxKeysSecured,
    maxKeysFailureReason,
    setMaxKeysFailureReason,
  } = useMaxKeysSecurityState(isEditing, existingDailyQuest);

  const {
    transferabilitySecured,
    setTransferabilitySecured,
    transferabilityFailureReason,
    setTransferabilityFailureReason,
  } = useTransferabilitySecurityState(isEditing, existingDailyQuest);

  // Track the most recent grant/config outcomes during submit to avoid async state races
  const deploymentOutcomeRef = useRef<{
    grantFailed?: boolean;
    grantError?: string;
    configFailed?: boolean;
    configError?: string;
    transferFailed?: boolean;
    transferError?: string;
  }>({});

  const [eligMinVendorStage, setEligMinVendorStage] = useState<string>("");
  const [eligGoodDollar, setEligGoodDollar] = useState(false);
  const [showRequiredLock, setShowRequiredLock] = useState(false);
  const [eligRequiredLock, setEligRequiredLock] = useState<string>("");
  const { questOptions, loading: loadingQuests } = useAdminQuestOptions();
  const [selectedQuestId, setSelectedQuestId] = useState<string>("");
  const [showErc20, setShowErc20] = useState(false);
  const [erc20Token, setErc20Token] = useState<string>("");
  const [erc20MinBalance, setErc20MinBalance] = useState<string>("");
  const [erc20ChainId, setErc20ChainId] = useState<string>("8453");

  const [tasks, setTasks] = useState<any[]>([
    { tempId: nanoid(), order_index: 0 },
  ]);

  // Transaction stepper modal state (lock deployment UX)
  const [isStepperOpen, setIsStepperOpen] = useState(false);
  const [stepperTitle, setStepperTitle] = useState("Deploy daily quest lock");
  const [deploymentSteps, setDeploymentSteps] = useState<DeploymentStep[]>([]);
  const stepperDecisionResolverRef = useRef<
    ((decision: "retry" | "cancel" | "skip") => void) | null
  >(null);

  const deploymentFlow = useMemo(
    () =>
      buildQuestDeploymentFlow({
        title: "Deploy daily quest lock",
        description:
          "Deploys the daily quest completion lock and applies required configuration.",
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
  } = useTransactionStepper(deploymentFlow.steps);

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

  const fetchExisting = useCallback(async () => {
    if (!props.dailyQuestId) return;
    setLoading(true);
    try {
      const result = await adminFetch<{ success: boolean; data: any }>(
        `/api/admin/daily-quests/${props.dailyQuestId}`,
      );
      if (result.error) throw new Error(result.error);
      const tmpl = result.data?.data;
      setExistingDailyQuest(tmpl);
      setTitle(tmpl?.title || "");
      setDescription(tmpl?.description || "");
      setImageUrl(tmpl?.image_url ?? null);
      setIsActive(Boolean(tmpl?.is_active));
      setCompletionBonus(
        Number(tmpl?.completion_bonus_reward_amount || 0) || 0,
      );

      setLockAddress(tmpl?.lock_address || "");
      if (tmpl?.lock_address) {
        setShowAutoLockCreation(false);
      }

      const elig = tmpl?.eligibility_config || {};
      setEligMinVendorStage(
        typeof elig.min_vendor_stage === "number"
          ? String(elig.min_vendor_stage)
          : "",
      );
      setEligGoodDollar(Boolean(elig.requires_gooddollar_verification));
      setEligRequiredLock(elig.required_lock_address || "");
      setShowRequiredLock(Boolean(elig.required_lock_address));
      const hasErc20 = Boolean(
        elig.required_erc20?.token || elig.required_erc20?.min_balance,
      );
      setShowErc20(hasErc20);
      setErc20Token(elig.required_erc20?.token || "");
      setErc20MinBalance(elig.required_erc20?.min_balance || "");
      setErc20ChainId(String(elig.required_erc20?.chain_id || "8453"));

      const existingTasks = Array.isArray(tmpl?.daily_quest_tasks)
        ? tmpl.daily_quest_tasks
        : [];
      setTasks(
        existingTasks.length
          ? existingTasks.map((t: any) => ({ ...t, tempId: nanoid() }))
          : [{ tempId: nanoid(), order_index: 0 }],
      );
    } catch (err: any) {
      log.error("Failed to load daily quest template", err);
      toast.error(err?.message || "Failed to load daily quest");
    } finally {
      setLoading(false);
    }
  }, [adminFetch, props.dailyQuestId]);

  useEffect(() => {
    fetchExisting();
  }, [fetchExisting]);

  // Sync selectedQuestId dropdown if eligRequiredLock changes manually
  useEffect(() => {
    if (questOptions.length > 0) {
      const match = questOptions.find(
        (q) =>
          q.lock_address?.toLowerCase() === eligRequiredLock.toLowerCase() &&
          eligRequiredLock.length > 0,
      );
      if (match) {
        setSelectedQuestId(match.id);
      } else {
        setSelectedQuestId("");
      }
    }
  }, [eligRequiredLock, questOptions]);

  const normalizedTasks = useMemo(() => {
    return tasks
      .map((t, idx) => ({
        ...t,
        order_index: idx,
      }))
      .filter((t) => (t.title || "").trim() && (t.description || "").trim());
  }, [tasks]);

  const totalReward = useMemo(
    () =>
      normalizedTasks.reduce(
        (sum, task) => sum + (Number(task.reward_amount || 0) || 0),
        0,
      ) + (Number.isInteger(completionBonus) ? completionBonus : 0),
    [normalizedTasks, completionBonus],
  );

  const buildDraftPayload = useCallback(() => {
    return {
      title,
      description,
      image_url: imageUrl,
      is_active: isActive,
      completion_bonus_reward_amount: completionBonus,
      lock_address: lockAddress,
      auto_lock_creation: showAutoLockCreation,
      lock_manager_granted: lockManagerGranted,
      grant_failure_reason: grantFailureReason,
      max_keys_secured: maxKeysSecured,
      max_keys_failure_reason: maxKeysFailureReason,
      transferability_secured: transferabilitySecured,
      transferability_failure_reason: transferabilityFailureReason,
      eligibility_config: {
        ...(eligMinVendorStage !== ""
          ? { min_vendor_stage: Number(eligMinVendorStage) }
          : {}),
        ...(eligGoodDollar ? { requires_gooddollar_verification: true } : {}),
        ...(showRequiredLock && eligRequiredLock.trim()
          ? { required_lock_address: eligRequiredLock.trim() }
          : {}),
        ...(showErc20 && erc20Token.trim() && erc20MinBalance.trim()
          ? {
              required_erc20: {
                token: erc20Token.trim(),
                min_balance: erc20MinBalance.trim(),
                chain_id: Number(erc20ChainId),
              },
            }
          : {}),
      },
      daily_quest_tasks: tasks,
    };
  }, [
    title,
    description,
    imageUrl,
    isActive,
    completionBonus,
    lockAddress,
    showAutoLockCreation,
    lockManagerGranted,
    grantFailureReason,
    maxKeysSecured,
    maxKeysFailureReason,
    transferabilitySecured,
    transferabilityFailureReason,
    eligMinVendorStage,
    eligGoodDollar,
    showRequiredLock,
    eligRequiredLock,
    showErc20,
    erc20Token,
    erc20MinBalance,
    erc20ChainId,
    tasks,
  ]);

  useEffect(() => {
    if (isEditing) return;
    const draft = getDraft(draftEntityType, draftScopeKey);
    if (!draft) return;

    let cancelled = false;
    const form = (draft.formData || {}) as any;

    const hydrateDraft = (showRestoreToast = true) => {
      setTitle(form.title || "");
      setDescription(form.description || "");
      setImageUrl(form.image_url ?? null);
      setIsActive(form.is_active ?? true);
      setCompletionBonus(Number(form.completion_bonus_reward_amount || 0) || 0);
      setLockAddress(form.lock_address || "");
      setShowAutoLockCreation(Boolean(form.auto_lock_creation ?? true));
      if (form.lock_address) {
        setShowAutoLockCreation(false);
      }

      setLockManagerGranted(Boolean(form.lock_manager_granted ?? true));
      setGrantFailureReason(form.grant_failure_reason || null);
      setMaxKeysSecured(Boolean(form.max_keys_secured ?? true));
      setMaxKeysFailureReason(form.max_keys_failure_reason || null);
      setTransferabilitySecured(Boolean(form.transferability_secured ?? true));
      setTransferabilityFailureReason(
        form.transferability_failure_reason || null,
      );

      const elig = form.eligibility_config || {};
      setEligMinVendorStage(
        typeof elig.min_vendor_stage === "number"
          ? String(elig.min_vendor_stage)
          : "",
      );
      setEligGoodDollar(Boolean(elig.requires_gooddollar_verification));
      setEligRequiredLock(elig.required_lock_address || "");
      setShowRequiredLock(Boolean(elig.required_lock_address));
      const hasErc20 = Boolean(
        elig.required_erc20?.token || elig.required_erc20?.min_balance,
      );
      setShowErc20(hasErc20);
      setErc20Token(elig.required_erc20?.token || "");
      setErc20MinBalance(elig.required_erc20?.min_balance || "");
      setErc20ChainId(String(elig.required_erc20?.chain_id || "8453"));

      const draftTasks = Array.isArray(form.daily_quest_tasks)
        ? form.daily_quest_tasks
        : [];
      setTasks(
        draftTasks.length
          ? draftTasks.map((t: any, idx: number) => ({
              ...t,
              tempId: t.tempId || nanoid(),
              order_index:
                typeof t.order_index === "number" ? t.order_index : idx,
            }))
          : [{ tempId: nanoid(), order_index: 0 }],
      );

      if (showRestoreToast) {
        toast.success(
          form.lock_address
            ? "Restored daily quest draft with deployed lock"
            : "Restored daily quest draft",
        );
      }
    };

    const fetchExistingDraftById = async (id: string) => {
      const response = await silentFetch<{ success: boolean; data: any }>(
        `/api/admin/daily-quests/${id}`,
      );
      if (response.error) return null;
      return response.data?.data ?? null;
    };

    const resolveDraft = async () => {
      const hadDraftId = Boolean(form?.id);
      const resolution = await resolveDraftById({
        draft: draft as any,
        fetchExisting: fetchExistingDraftById,
      });

      if (cancelled) return;

      if (resolution.mode === "existing") {
        removeDraft(draftEntityType, draftScopeKey);
        toast.success("Draft already saved — redirecting to daily quest editor.");
        router.replace(`/admin/quests/daily/${resolution.draftId}/edit`);
        return;
      }

      if (hadDraftId) {
        showInfoToast(
          "Saved daily quest not found — continuing with draft as a new daily quest.",
        );
      }
      hydrateDraft(!hadDraftId);
    };

    void resolveDraft();
    return () => {
      cancelled = true;
    };
  }, [
    isEditing,
    draftEntityType,
    draftScopeKey,
    silentFetch,
    router,
    setLockManagerGranted,
    setGrantFailureReason,
    setMaxKeysSecured,
    setMaxKeysFailureReason,
    setTransferabilitySecured,
    setTransferabilityFailureReason,
  ]);

  const validateClient = () => {
    if (!title.trim()) return "Title is required";
    if (!description.trim()) return "Description is required";
    if (normalizedTasks.length < 1) return "At least one task is required";
    if (!Number.isInteger(completionBonus) || completionBonus < 0) {
      return "Completion bonus reward amount must be an integer >= 0";
    }

    if (lockAddress.trim() && !isAddress(lockAddress.trim())) {
      return "Invalid lock address";
    }

    if (eligRequiredLock.trim() && !isAddress(eligRequiredLock.trim())) {
      return "Invalid required lock address";
    }

    if (showErc20) {
      if (!erc20Token.trim() || !erc20MinBalance.trim()) {
        return "Required ERC20 token and minimum balance must both be set";
      }
      if (!isAddress(erc20Token.trim())) {
        return "Invalid ERC20 token address";
      }
      if (!/^[0-9]+(\.[0-9]+)?$/.test(erc20MinBalance.trim())) {
        return "ERC20 minimum balance must be a human decimal string";
      }
      if (!(Number(erc20MinBalance.trim()) > 0)) {
        return "ERC20 minimum balance must be > 0";
      }
      const chainId = Number(erc20ChainId);
      if (!Number.isInteger(chainId) || chainId <= 0) {
        return "Please select a valid ERC20 token network";
      }
    }

    return null;
  };

  const handleAddTask = () => {
    setTasks((prev) => [
      ...prev,
      { tempId: nanoid(), order_index: prev.length },
    ]);
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
    const temp = newTasks[index];
    const target = newTasks[targetIndex];
    if (temp && target) {
      newTasks[index] = target;
      newTasks[targetIndex] = temp;
    }
    setTasks(newTasks);
  };

  const deployLock = async () => {
    try {
      if (!isEditing) {
        saveDraft(draftEntityType, buildDraftPayload(), draftScopeKey);
      }
      if (!wallet)
        throw new Error("Please connect your wallet to deploy the lock");
      if (!title.trim())
        throw new Error("Please enter title before deploying lock");

      const lockConfig = generateQuestLockConfig({ title } as any);
      const deployConfig = createLockConfigWithManagers(lockConfig);
      const params = convertLockConfigToDeploymentParams(deployConfig, isAdmin);
      const { steps, getResult } = createAdminLockDeploymentSteps(params);

      setDeploymentSteps(steps);
      setStepperTitle(`Deploy lock for ${title}`);
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
      const deployedLockAddress: string | undefined =
        deploymentResult?.lockAddress;
      if (!deploymentResult?.success || !deployedLockAddress) {
        throw new Error("Lock deployment failed");
      }

      setLockAddress(deployedLockAddress);
      setShowAutoLockCreation(false);

      // Record outcomes in ref for the final save
      deploymentOutcomeRef.current = {
        grantFailed: deploymentResult.grantFailed,
        grantError: deploymentResult.grantError,
        configFailed: deploymentResult.configFailed,
        configError: deploymentResult.configError,
        transferFailed: deploymentResult.transferConfigFailed,
        transferError: deploymentResult.transferConfigError,
      };

      const outcome = applyDeploymentOutcome(deploymentResult);
      setLockManagerGranted(outcome.granted);
      setGrantFailureReason(outcome.reason);

      // Also update security outcomes in state
      if (deploymentResult.configFailed) setMaxKeysSecured(false);
      setMaxKeysFailureReason(deploymentResult.configError);

      setTransferabilitySecured(!deploymentResult.transferConfigFailed);
      setTransferabilityFailureReason(deploymentResult.transferConfigError);

      if (deploymentResult.grantFailed) {
        toast(
          <>
            Lock deployed successfully!
            <br />
            ⚠️ Grant manager role failed.
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

      if (!isEditing) {
        updateDraftWithDeploymentResult(draftEntityType, draftScopeKey, {
          lockAddress: deployedLockAddress,
          grantFailed: deploymentResult.grantFailed,
          grantError: deploymentResult.grantError,
        });
      }
    } catch (err: any) {
      log.error("Daily quest lock deployment failed", err);
      toast.error(err?.message || "Lock deployment failed");
      setIsStepperOpen(false);
    }
  };

  const runStepperFlow = useCallback(
    async (steps: DeploymentStep[], title: string) => {
      setDeploymentSteps(steps);
      setStepperTitle(title);
      setIsStepperOpen(true);
      await stepperWaitForSteps(steps.length);
      try {
        await stepperStart();
      } catch (initialErr: any) {
        let err = initialErr;
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
          }
        }
      }
      setIsStepperOpen(false);
    },
    [stepperWaitForSteps, stepperStart, stepperCancel, stepperSkip, stepperRetry],
  );

  const buildPayload = useCallback(
    (resolvedLockAddress: string) => {
      const eligibility_config: any = {};
      if (eligMinVendorStage !== "") {
        eligibility_config.min_vendor_stage = Number(eligMinVendorStage);
      }
      if (eligGoodDollar) {
        eligibility_config.requires_gooddollar_verification = true;
      }
      if (showRequiredLock && eligRequiredLock.trim()) {
        eligibility_config.required_lock_address = eligRequiredLock.trim();
      }
      if (showErc20 && erc20Token.trim() && erc20MinBalance.trim()) {
        eligibility_config.required_erc20 = {
          token: erc20Token.trim(),
          min_balance: erc20MinBalance.trim(),
          chain_id: Number(erc20ChainId),
        };
      }

      const effectiveGrant = effectiveGrantForSave({
        outcome: {
          lastGrantFailed: deploymentOutcomeRef.current.grantFailed,
          lastGrantError: deploymentOutcomeRef.current.grantError,
        },
        lockAddress: resolvedLockAddress,
        currentGranted: lockManagerGranted,
        currentReason: grantFailureReason,
      });

      const effectiveMaxKeys = effectiveMaxKeysForSave({
        outcome: {
          lastConfigFailed: deploymentOutcomeRef.current.configFailed,
          lastConfigError: deploymentOutcomeRef.current.configError,
        },
        lockAddress: resolvedLockAddress,
        currentSecured: maxKeysSecured,
        currentReason: maxKeysFailureReason,
      });

      const effectiveTransferability = effectiveTransferabilityForSave({
        outcome: {
          lastTransferFailed: deploymentOutcomeRef.current.transferFailed,
          lastTransferError: deploymentOutcomeRef.current.transferError,
        },
        lockAddress: resolvedLockAddress,
        currentSecured: transferabilitySecured,
        currentReason: transferabilityFailureReason,
      });

      return {
        title: title.trim(),
        description: description.trim(),
        image_url: imageUrl,
        is_active: isActive,
        completion_bonus_reward_amount: completionBonus,
        lock_address: resolvedLockAddress || null,
        lock_manager_granted: effectiveGrant.granted,
        grant_failure_reason: effectiveGrant.reason || null,
        max_keys_secured: effectiveMaxKeys.secured,
        max_keys_failure_reason: effectiveMaxKeys.reason || null,
        transferability_secured: effectiveTransferability.secured,
        transferability_failure_reason: effectiveTransferability.reason || null,
        eligibility_config,
        daily_quest_tasks: normalizedTasks.map((t, idx) => ({
          id: t.id,
          title: (t.title || "").trim(),
          description: (t.description || "").trim(),
          task_type: t.task_type,
          verification_method: t.verification_method,
          reward_amount: Number(t.reward_amount || 0) || 0,
          order_index: idx,
          task_config: t.task_config ?? {},
          input_required: Boolean(t.input_required),
          input_label: t.input_label ?? null,
          input_placeholder: t.input_placeholder ?? null,
          input_validation: t.input_validation ?? null,
          requires_admin_review: Boolean(t.requires_admin_review),
        })),
      };
    },
    [
      title,
      description,
      imageUrl,
      isActive,
      completionBonus,
      eligMinVendorStage,
      eligGoodDollar,
      showRequiredLock,
      eligRequiredLock,
      showErc20,
      erc20Token,
      erc20MinBalance,
      erc20ChainId,
      lockManagerGranted,
      grantFailureReason,
      maxKeysSecured,
      maxKeysFailureReason,
      transferabilitySecured,
      transferabilityFailureReason,
      normalizedTasks,
    ],
  );

  const handleSave = async () => {
    setError(null);
    const err = validateClient();
    if (err) {
      setError(err);
      toast.error(err);
      return;
    }

    const trimmedLockAddress = lockAddress.trim();
    if (trimmedLockAddress && !isAddress(trimmedLockAddress)) {
      setError("Invalid lock address");
      toast.error("Invalid lock address");
      return;
    }

    setIsSubmitting(true);
    try {
      deploymentOutcomeRef.current = {};
      if (!isEditing) {
        saveDraft(draftEntityType, buildDraftPayload(), draftScopeKey);
      }

      const endpoint = isEditing
        ? `/api/admin/daily-quests/${props.dailyQuestId}`
        : "/api/admin/daily-quests";
      const method = isEditing ? "PUT" : "POST";

      const shouldAutoDeploy =
        !isEditing && showAutoLockCreation && !trimmedLockAddress && totalReward > 0;

      const persist = async (resolvedLockAddress: string) => {
        const payload = buildPayload(resolvedLockAddress);
        const result = await adminFetch(endpoint, {
          method,
          body: JSON.stringify(payload),
        });
        if (result.error) throw new Error(result.error);
        return payload;
      };

      let payload: any;
      if (shouldAutoDeploy) {
        if (!wallet) {
          throw new Error("Please connect your wallet to deploy the lock");
        }
        const lockConfig = generateQuestLockConfig({ title } as any);
        const deployConfig = createLockConfigWithManagers(lockConfig);
        const params = convertLockConfigToDeploymentParams(deployConfig, isAdmin);
        const deployment = createAdminLockDeploymentSteps(params);
        const steps = [...deployment.steps];
        steps.push({
          id: "daily-quest:create-db",
          title: "Create daily quest",
          description: "Save daily quest details and tasks to database.",
          execute: async () => {
            const result = deployment.getResult();
            if (!result?.success || !result.lockAddress) {
              throw new Error("Lock deployment failed");
            }
            setLockAddress(result.lockAddress);
            setShowAutoLockCreation(false);
            deploymentOutcomeRef.current = {
              grantFailed: result.grantFailed,
              grantError: result.grantError,
              configFailed: result.configFailed,
              configError: result.configError,
              transferFailed: result.transferConfigFailed,
              transferError: result.transferConfigError,
            };
            const outcome = applyDeploymentOutcome(result);
            setLockManagerGranted(outcome.granted);
            setGrantFailureReason(outcome.reason);
            setMaxKeysSecured(!result.configFailed);
            setMaxKeysFailureReason(result.configError);
            setTransferabilitySecured(!result.transferConfigFailed);
            setTransferabilityFailureReason(result.transferConfigError);
            updateDraftWithDeploymentResult(draftEntityType, draftScopeKey, {
              lockAddress: result.lockAddress,
              grantFailed: result.grantFailed,
              grantError: result.grantError,
            });
            payload = await persist(result.lockAddress);
            return { data: { lockAddress: result.lockAddress } };
          },
        });

        await runStepperFlow(steps, `Create quest: ${title.trim() || "Daily quest"}`);
      } else {
        payload = await persist(trimmedLockAddress);
      }

      const createMode = !isEditing;
      toast.success(createMode ? "Daily quest created" : "Daily quest updated");
      if (createMode) {
        removeDraft(draftEntityType, draftScopeKey);
        void router.push("/admin/quests?tab=daily");
      } else {
        setExistingDailyQuest((prev: any) => ({
          ...(prev || {}),
          ...(payload || {}),
          id: props.dailyQuestId || prev?.id,
          daily_quest_tasks: payload?.daily_quest_tasks || prev?.daily_quest_tasks,
        }));
      }
    } catch (err: any) {
      log.error("Failed to save daily quest", err);
      setError(err?.message || "Failed to save daily quest");
      toast.error(err?.message || "Failed to save daily quest");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-8">
      <TransactionStepperModal
        open={isStepperOpen}
        title={stepperTitle}
        description={deploymentFlow.description}
        steps={stepperState.steps}
        activeStepIndex={stepperState.activeStepIndex}
        canClose={stepperState.canClose}
        onRetry={handleStepperRetry}
        onSkip={handleStepperSkip}
        onCancel={handleStepperCancel}
        onClose={handleStepperClose}
      />
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Quest Basic Info */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-bold text-white mb-4">
          Daily Quest Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <Label className="text-white">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent border-gray-700 text-gray-100"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-white">Description</Label>
            <RichTextEditor
              value={description}
              onChange={(next) => setDescription(next)}
              placeholder="Describe the daily quest..."
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label className="text-white">Image</Label>
            <ImageUpload
              value={imageUrl || undefined}
              onChange={(url) => setImageUrl(url)}
              bucketName="bootcamp-images"
            />
          </div>
        </div>
      </div>

      {/* Quest Configuration Sections */}
      <div className="space-y-6">
        <div className="border border-gray-800 rounded-xl p-5 bg-gray-900/40 space-y-4">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Lock Configuration
          </h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-white">Lock Address</Label>
              {!isEditing && !lockAddress && (
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="auto_lock_creation"
                    checked={showAutoLockCreation}
                    onChange={(e) => setShowAutoLockCreation(e.target.checked)}
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
              value={lockAddress}
              onChange={(e) => setLockAddress(e.target.value)}
              placeholder={
                showAutoLockCreation && !isEditing
                  ? "Will be auto-generated..."
                  : "0x..."
              }
              className="bg-transparent border-gray-700 text-gray-100 font-mono"
              disabled={(showAutoLockCreation && !isEditing) || isSubmitting}
            />

            {/* Lock Manager Status Toggle */}
            <LockManagerToggle
              isGranted={lockManagerGranted}
              onToggle={setLockManagerGranted}
              lockAddress={lockAddress}
              isEditing={isEditing}
            />

            {showAutoLockCreation &&
              !isEditing &&
              !lockAddress &&
              totalReward > 0 && (
                <p className="text-sm text-blue-400 mt-1">
                  ✨ A new completion lock will be automatically deployed for
                  this daily quest using your connected wallet
                </p>
              )}
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Manually deploy lock</div>
              <div className="text-xs text-gray-400">
                Deploy and grant server wallet manager role.
              </div>
            </div>
            <Button
              type="button"
              className="bg-flame-yellow hover:bg-flame-yellow/90 text-black font-semibold border-none rounded-lg h-9 px-4 text-xs transition-all active:scale-95 shadow-[0_0_15px_rgba(251,191,36,0.3)]"
              onClick={deployLock}
              disabled={isSubmitting}
            >
              Deploy Lock
            </Button>
          </div>
        </div>

        <div className="border border-gray-800 rounded-xl p-5 bg-gray-900/40 space-y-4">
          <h3 className="text-white font-semibold">
            Completion Bonus Reward
          </h3>
          <div className="space-y-2">
            <Label className="text-white">Completion Bonus (xDG)</Label>
            <Input
              type="number"
              min={0}
              step={1}
              value={completionBonus}
              onChange={(e) =>
                setCompletionBonus(Number(e.target.value || 0))
              }
              className="bg-transparent border-gray-700 text-gray-100"
            />
          </div>
        </div>

        <div className="border border-gray-800 rounded-xl p-5 bg-gray-900/40 space-y-4">
          <h3 className="text-white font-semibold">
            Eligibility Requirements
          </h3>

          <div className="space-y-2">
            <Label className="text-white">Minimum Vendor Level</Label>
            <Select
              value={eligMinVendorStage || "none"}
              onValueChange={(v) =>
                setEligMinVendorStage(v === "none" ? "" : v)
              }
            >
              <SelectTrigger className="bg-transparent border-gray-700 text-gray-100">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {getStageOptions().map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">
                GoodDollar Verification
              </div>
            </div>
            <Toggle
              checked={eligGoodDollar}
              onCheckedChange={setEligGoodDollar}
              ariaLabel="Requires GoodDollar verification"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">Required Lock Key</div>
            </div>
            <Toggle
              checked={showRequiredLock}
              onCheckedChange={setShowRequiredLock}
              ariaLabel="Requires holding a specific lock key"
            />
          </div>

          {showRequiredLock && (
            <div className="space-y-3 pt-2">
              <div className="bg-gray-800/20 p-3 rounded-lg border border-gray-700/50 space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    Quick Selector
                  </p>
                  <select
                    value={selectedQuestId}
                    onChange={(e) => {
                      const questId = e.target.value;
                      setSelectedQuestId(questId);
                      if (questId) {
                        const selected = questOptions.find(
                          (q) => q.id === questId,
                        );
                        if (selected?.lock_address) {
                          setEligRequiredLock(selected.lock_address);
                        }
                      }
                    }}
                    className="w-full bg-gray-900/50 border border-gray-700 text-gray-100 rounded-md px-3 py-2 text-sm focus:border-flame-yellow/50 transition-colors"
                    disabled={loadingQuests}
                  >
                    <option value="" className="bg-gray-900 text-gray-400">
                      Select existing mission...
                    </option>
                    {questOptions.map((option) => (
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
                </div>

                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                    Custom Lock Address
                  </p>
                  <div className="relative">
                    <Input
                      value={eligRequiredLock}
                      onChange={(e) => setEligRequiredLock(e.target.value)}
                      placeholder="0x..."
                      className="bg-gray-900/50 border-gray-700 text-gray-100 font-mono focus:border-flame-yellow/50"
                    />
                    {!isAddress(eligRequiredLock) &&
                      eligRequiredLock.length > 0 && (
                        <p className="text-[10px] text-red-400 mt-1 pl-1">
                          Invalid Ethereum address
                        </p>
                      )}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed italic pr-4">
                Select an existing mission to auto-load its address, or enter a
                custom lock address manually.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-200">
                Required ERC20 Balance
              </div>
            </div>
            <Toggle
              checked={showErc20}
              onCheckedChange={setShowErc20}
              ariaLabel="Enable ERC20 requirement"
            />
          </div>

          {showErc20 && (
            <div className="space-y-4 border border-gray-800 rounded-lg p-4 bg-gray-900/30">
              <NetworkSelector
                chainId={erc20ChainId}
                onChange={setErc20ChainId}
                label="Choose Token Network"
              />
              <div className="space-y-2">
                <Label className="text-white">Token Contract</Label>
                <Input
                  value={erc20Token}
                  onChange={(e) => setErc20Token(e.target.value)}
                  placeholder="0x..."
                  className="bg-transparent border-gray-700 text-gray-100 font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-white">Minimum Balance</Label>
                <Input
                  value={erc20MinBalance}
                  onChange={(e) => setErc20MinBalance(e.target.value)}
                  placeholder='e.g. "0.02"'
                  className="bg-transparent border-gray-700 text-gray-100"
                />
              </div>
            </div>
          )}
        </div>

        <div className="border border-gray-800 rounded-xl p-5 bg-gray-900/40 space-y-4">
          <h3 className="text-white font-semibold">Status</h3>
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-200">Active</div>
            <Toggle
              checked={isActive}
              onCheckedChange={setIsActive}
              ariaLabel="Active"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Tasks</h2>
          <Button type="button" onClick={handleAddTask}>
            <PlusCircle className="w-4 h-4 mr-2" />
            Add Task
          </Button>
        </div>

        {tasks.map((t, idx) => (
          <DailyQuestTaskForm
            key={t.id || t.tempId || idx}
            task={t as any}
            index={idx}
            onUpdate={(updated) =>
              setTasks((prev) => prev.map((p, i) => (i === idx ? updated : p)))
            }
            onRemove={() =>
              setTasks((prev) => prev.filter((_, i) => i !== idx))
            }
            onMoveUp={() => handleMoveTask(idx, "up")}
            onMoveDown={() => handleMoveTask(idx, "down")}
            canMoveUp={idx > 0}
            canMoveDown={idx < tasks.length - 1}
          />
        ))}
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/admin/quests?tab=daily")}
        >
          <X className="w-4 h-4 mr-2" />
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={isSubmitting}>
          <Save className="w-4 h-4 mr-2" />
          {isSubmitting
            ? isEditing
              ? "Updating..."
              : "Creating..."
            : isEditing
              ? "Update quest"
              : "Create quest"}
        </Button>
      </div>
    </div>
  );
}

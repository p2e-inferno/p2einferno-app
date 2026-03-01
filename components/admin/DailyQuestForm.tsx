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
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useDeployAdminLock } from "@/hooks/unlock/useDeployAdminLock";
import {
  generateQuestLockConfig,
  createLockConfigWithManagers,
} from "@/lib/blockchain/legacy";
import { convertLockConfigToDeploymentParams } from "@/lib/blockchain/shared/lock-config-converter";
import { TransactionStepperModal } from "@/components/admin/TransactionStepperModal";
import { useTransactionStepper } from "@/hooks/useTransactionStepper";
import { buildQuestDeploymentFlow } from "@/lib/blockchain/deployment-flows";
import type { DeploymentStep } from "@/lib/transaction-stepper/types";
import { applyDeploymentOutcome } from "@/lib/blockchain/shared/grant-state";
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

const log = getLogger("admin:DailyQuestForm");

type TaskWithTempId = {
  id?: string;
  tempId?: string;
  title?: string;
  description?: string;
  task_type?: string;
  verification_method?: string;
  reward_amount?: number;
  order_index?: number;
  task_config?: Record<string, unknown> | null;
  input_required?: boolean;
  input_label?: string | null;
  input_placeholder?: string | null;
  input_validation?: string | null;
  requires_admin_review?: boolean;
};

export function DailyQuestForm(props: { dailyQuestId?: string }) {
  const router = useRouter();
  const { adminFetch } = useAdminApi();
  const wallet = useSmartWalletSelection();
  const { isAdmin } = useAdminAuthContext();
  const { createAdminLockDeploymentSteps } = useDeployAdminLock({ isAdmin });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(Boolean(props.dailyQuestId));

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [completionBonus, setCompletionBonus] = useState(0);

  const [lockAddress, setLockAddress] = useState<string>("");
  const [lockManagerGranted, setLockManagerGranted] = useState(false);
  const [grantFailureReason, setGrantFailureReason] = useState<string>("");

  const [eligMinVendorStage, setEligMinVendorStage] = useState<string>("");
  const [eligGoodDollar, setEligGoodDollar] = useState(false);
  const [eligRequiredLock, setEligRequiredLock] = useState<string>("");
  const [showErc20, setShowErc20] = useState(false);
  const [erc20Token, setErc20Token] = useState<string>("");
  const [erc20MinBalance, setErc20MinBalance] = useState<string>("");

  const [tasks, setTasks] = useState<TaskWithTempId[]>([
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
      setTitle(tmpl?.title || "");
      setDescription(tmpl?.description || "");
      setImageUrl(tmpl?.image_url ?? null);
      setIsActive(Boolean(tmpl?.is_active));
      setCompletionBonus(
        Number(tmpl?.completion_bonus_reward_amount || 0) || 0,
      );

      setLockAddress(tmpl?.lock_address || "");
      setLockManagerGranted(Boolean(tmpl?.lock_manager_granted));
      setGrantFailureReason(tmpl?.grant_failure_reason || "");

      const elig = tmpl?.eligibility_config || {};
      setEligMinVendorStage(
        typeof elig.min_vendor_stage === "number"
          ? String(elig.min_vendor_stage)
          : "",
      );
      setEligGoodDollar(Boolean(elig.requires_gooddollar_verification));
      setEligRequiredLock(elig.required_lock_address || "");
      const hasErc20 = Boolean(
        elig.required_erc20?.token || elig.required_erc20?.min_balance,
      );
      setShowErc20(hasErc20);
      setErc20Token(elig.required_erc20?.token || "");
      setErc20MinBalance(elig.required_erc20?.min_balance || "");

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

  const normalizedTasks = useMemo(() => {
    return tasks
      .map((t, idx) => ({
        ...t,
        order_index: idx,
      }))
      .filter((t) => (t.title || "").trim() && (t.description || "").trim());
  }, [tasks]);

  const validateClient = () => {
    if (!title.trim()) return "Title is required";
    if (!description.trim()) return "Description is required";
    if (normalizedTasks.length < 1) return "At least one task is required";
    if (!Number.isInteger(completionBonus) || completionBonus < 0) {
      return "Completion bonus reward amount must be an integer >= 0";
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
      if (!/^[0-9]+(\\.[0-9]+)?$/.test(erc20MinBalance.trim())) {
        return "ERC20 minimum balance must be a human decimal string";
      }
      if (!(Number(erc20MinBalance.trim()) > 0)) {
        return "ERC20 minimum balance must be > 0";
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
      const outcome = applyDeploymentOutcome(deploymentResult);
      setLockManagerGranted(outcome.granted);
      setGrantFailureReason(outcome.reason || "");

      if (deploymentResult.grantFailed) {
        toast(
          <>
            Lock deployed successfully!
            <br />
            ⚠️ Grant manager role failed.
          </>,
          { duration: 8000, icon: "⚠️" },
        );
      } else {
        toast.success("Lock deployed successfully!");
      }
    } catch (err: any) {
      log.error("Daily quest lock deployment failed", err);
      toast.error(err?.message || "Lock deployment failed");
      setIsStepperOpen(false);
    }
  };

  const handleSave = async () => {
    const err = validateClient();
    if (err) {
      toast.error(err);
      return;
    }

    setIsSubmitting(true);
    try {
      const eligibility_config: any = {};
      if (eligMinVendorStage !== "") {
        eligibility_config.min_vendor_stage = Number(eligMinVendorStage);
      }
      if (eligGoodDollar) {
        eligibility_config.requires_gooddollar_verification = true;
      }
      if (eligRequiredLock.trim()) {
        eligibility_config.required_lock_address = eligRequiredLock.trim();
      }
      if (showErc20 && erc20Token.trim() && erc20MinBalance.trim()) {
        eligibility_config.required_erc20 = {
          token: erc20Token.trim(),
          min_balance: erc20MinBalance.trim(),
        };
      }

      const payload = {
        title: title.trim(),
        description: description.trim(),
        image_url: imageUrl,
        is_active: isActive,
        completion_bonus_reward_amount: completionBonus,
        lock_address: lockAddress.trim() || null,
        lock_manager_granted: lockManagerGranted,
        grant_failure_reason: lockManagerGranted
          ? null
          : grantFailureReason || null,
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

      const isEditing = Boolean(props.dailyQuestId);
      const endpoint = isEditing
        ? `/api/admin/daily-quests/${props.dailyQuestId}`
        : "/api/admin/daily-quests";
      const method = isEditing ? "PUT" : "POST";
      const result = await adminFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
      });
      if (result.error) {
        throw new Error(result.error);
      }

      toast.success("Daily quest saved");
      router.push("/admin/quests?tab=daily");
    } catch (err: any) {
      log.error("Failed to save daily quest", err);
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="space-y-2">
            <Label className="text-white">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="bg-transparent border-gray-700 text-gray-100"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Description</Label>
            <RichTextEditor
              value={description}
              onChange={(next) => setDescription(next)}
              placeholder="Describe the daily quest..."
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Image</Label>
            <ImageUpload
              value={imageUrl || undefined}
              onChange={(url) => setImageUrl(url)}
              bucketName="bootcamp-images"
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="border border-gray-800 rounded-xl p-5 bg-gray-900/40 space-y-4">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Lock Configuration
            </h3>

            <div className="space-y-2">
              <Label className="text-white">Lock Address</Label>
              <Input
                value={lockAddress}
                onChange={(e) => setLockAddress(e.target.value)}
                placeholder="0x..."
                className="bg-transparent border-gray-700 text-gray-100 font-mono"
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-200">Auto deploy lock</div>
                <div className="text-xs text-gray-400">
                  Deploy and grant server wallet manager role.
                </div>
              </div>
              <Button type="button" variant="outline" onClick={deployLock}>
                Deploy Lock
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Lock Manager Granted</Label>
              <Input
                value={lockManagerGranted ? "true" : "false"}
                disabled
                className="bg-transparent border-gray-700 text-gray-400"
              />
            </div>

            {!lockManagerGranted && (
              <div className="space-y-2">
                <Label className="text-white">Grant Failure Reason</Label>
                <Input
                  value={grantFailureReason}
                  onChange={(e) => setGrantFailureReason(e.target.value)}
                  className="bg-transparent border-gray-700 text-gray-100"
                />
              </div>
            )}
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

            <div className="space-y-2">
              <Label className="text-white">Required Lock Key</Label>
              <Input
                value={eligRequiredLock}
                onChange={(e) => setEligRequiredLock(e.target.value)}
                placeholder="0x..."
                className="bg-transparent border-gray-700 text-gray-100 font-mono"
              />
            </div>

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
              <div className="space-y-3 border border-gray-800 rounded-lg p-4 bg-gray-900/30">
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
          {isSubmitting ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}

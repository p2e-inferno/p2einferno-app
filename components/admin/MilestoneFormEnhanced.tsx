import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Zap } from "lucide-react";
import type { CohortMilestone } from "@/lib/supabase/types";
import { getRecordId } from "@/lib/utils/id-generation";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { useAdminFetchOnce } from "@/hooks/useAdminFetchOnce";
import { toast } from "react-hot-toast";
import {
  formatErrorMessageForToast,
  showInfoToast,
} from "@/lib/utils/toast-utils";
import {
  generateMilestoneLockConfig,
  createLockConfigWithManagers,
} from "@/lib/blockchain/legacy";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";
import { getLogger } from "@/lib/utils/logger";
import {
  savePendingDeployment,
  getDraft,
  saveDraft,
  removeDraft,
  updateDraftWithDeploymentResult,
} from "@/lib/utils/lock-deployment-state";
import { resolveDraftById } from "@/lib/utils/draft";
import ConfirmationDialog from "@/components/ui/confirmation-dialog";
import { useDeployAdminLock } from "@/hooks/unlock/useDeployAdminLock";
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

const log = getLogger("admin:MilestoneFormEnhanced");

type TaskType = "file_upload" | "url_submission" | "contract_interaction";

interface TaskForm {
  id: string;
  title: string;
  description: string;
  reward_amount: number;
  order_index: number;
  task_type: TaskType;
  contract_network?: string;
  contract_address?: string;
  contract_method?: string;
  _isFromDatabase?: boolean; // Track if task came from database
}

const AVAILABLE_NETWORKS = [
  { value: "base", label: "Base Mainnet", chainId: 8453 },
  { value: "base-sepolia", label: "Base Sepolia", chainId: 84532 },
];

const TASK_TYPES = [
  {
    value: "file_upload" as TaskType,
    label: "File Upload",
    description: "User uploads a file for review",
  },
  {
    value: "url_submission" as TaskType,
    label: "URL Submission",
    description: "User submits a URL link",
  },
  {
    value: "contract_interaction" as TaskType,
    label: "Contract Interaction",
    description: "User interacts with a smart contract",
  },
];

interface MilestoneFormEnhancedProps {
  cohortId: string;
  milestone?: CohortMilestone;
  existingMilestones?: CohortMilestone[];
  onSubmitSuccess?: () => void;
  onCancel?: () => void;
}

/**
 * Render a form to create or edit a cohort milestone with task management and optional automatic Unlock Protocol lock deployment.
 *
 * Manages form state and draft restoration, validates input, supports adding/updating/deleting tasks, optionally deploys and records an access lock for the milestone, and persists the milestone and its tasks via the admin API. When a lock is deployed the component records a pending deployment (including parent cohort lock address and sanitized tasks) to enable recovery if database persistence fails.
 *
 * @param cohortId - ID of the parent cohort.
 * @param milestone - Existing milestone to edit; omit to create a new milestone.
 * @param existingMilestones - Milestones in the cohort used to compute ordering and prerequisite options.
 * @param onSubmitSuccess - Optional callback invoked after a successful save.
 * @param onCancel - Optional callback invoked when the user cancels the form.
 * @returns The milestone form React element.
 */
export default function MilestoneFormEnhanced({
  cohortId,
  milestone,
  existingMilestones = [],
  onSubmitSuccess,
  onCancel,
}: MilestoneFormEnhancedProps) {
  const router = useRouter();
  const isEditing = !!milestone;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeployingLock, setIsDeployingLock] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState("");
  const [showAutoLockCreation, setShowAutoLockCreation] = useState(!isEditing);
  const [error, setError] = useState<string | null>(null);
  // Use the reusable hook for lock manager state management
  const {
    lockManagerGranted,
    setLockManagerGranted,
    grantFailureReason,
    setGrantFailureReason,
  } = useLockManagerState(isEditing, milestone);

  const {
    maxKeysSecured,
    setMaxKeysSecured,
    maxKeysFailureReason,
    setMaxKeysFailureReason,
  } = useMaxKeysSecurityState(isEditing, milestone);
  const {
    transferabilitySecured,
    setTransferabilitySecured,
    transferabilityFailureReason,
    setTransferabilityFailureReason,
  } = useTransferabilitySecurityState(isEditing, milestone);

  // Track the most recent grant/config outcomes during submit to avoid async state races
  const deploymentOutcomeRef = useRef<{
    grantFailed?: boolean;
    grantError?: string;
    configFailed?: boolean;
    configError?: string;
    transferFailed?: boolean;
    transferError?: string;
  }>({});
  const { adminFetch } = useAdminApi();
  const { adminFetch: silentFetch } = useAdminApi({ suppressToasts: true });
  const wallet = useSmartWalletSelection();
  const { authenticated, isAdmin, user } = useAdminAuthContext();
  const { deployAdminLock, isLoading: isDeployingFromHook } =
    useDeployAdminLock({ isAdmin });

  const [formData, setFormData] = useState<Partial<CohortMilestone>>(
    milestone || {
      id: getRecordId(false),
      cohort_id: cohortId,
      name: "",
      description: "",
      order_index:
        existingMilestones.length > 0
          ? Math.max(...existingMilestones.map((m) => m.order_index)) + 10
          : 0,
      start_date: "",
      end_date: "",
      lock_address: "",
      prerequisite_milestone_id: "",
      duration_hours: 8,
      total_reward: 0,
    },
  );

  const [tasks, setTasks] = useState<TaskForm[]>([
    {
      id: getRecordId(false),
      title: "",
      description: "",
      reward_amount: 0,
      order_index: 0,
      task_type: "file_upload",
      contract_network: "",
      contract_address: "",
      contract_method: "",
      _isFromDatabase: false, // Mark initial task as new
    },
  ]);

  const [deletedTasks, setDeletedTasks] = useState<string[]>([]);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  // Load draft data on mount for new milestones
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isEditing) return;

    const draft = getDraft("milestone");
    if (!draft?.formData || typeof draft.formData !== "object") return;

    let cancelled = false;

    const hydrateDraft = (showRestoreToast: boolean = true) => {
      const {
        tasks: draftTasks,
        auto_lock_creation: draftAutoLockCreation,
        ...sanitizedDraftForm
      } = draft.formData as Partial<CohortMilestone> & {
        tasks?: TaskForm[];
        auto_lock_creation?: boolean;
        lock_manager_granted?: boolean;
        grant_failure_reason?: string;
      };

      if (draftTasks) {
        if (Array.isArray(draftTasks)) {
          log.debug("Restored milestone draft tasks", {
            taskCount: draftTasks.length,
          });
          setTasks(draftTasks);
        } else {
          log.warn("Ignoring malformed tasks payload on milestone draft", {
            valueType: typeof draftTasks,
          });
        }
      }

      if (typeof draftAutoLockCreation === "boolean") {
        setShowAutoLockCreation(draftAutoLockCreation);
      }

      setFormData((prev) => ({ ...prev, ...sanitizedDraftForm }));

      if (sanitizedDraftForm.lock_manager_granted === false) {
        setLockManagerGranted(false);
        setGrantFailureReason(sanitizedDraftForm.grant_failure_reason);
      }

      if (showRestoreToast) {
        if (sanitizedDraftForm.lock_address) {
          setShowAutoLockCreation(false);
          toast.success("Restored draft data with deployed lock");
        } else {
          toast.success("Restored draft data");
        }
      }
    };

    const fetchExisting = async (id: string) => {
      const response = await silentFetch<{
        success: boolean;
        data?: CohortMilestone;
      }>(`/api/admin/milestones?milestone_id=${id}`);
      if (response.error || !response.data?.data) {
        return null;
      }
      return response.data.data;
    };

    const resolveDraft = async () => {
      const hadDraftId = Boolean(draft.formData?.id);
      const resolution = await resolveDraftById({
        draft,
        fetchExisting,
      });

      if (cancelled) return;

      if (resolution.mode === "existing") {
        removeDraft("milestone");
        toast.success(
          "Draft already saved — redirecting to milestone details.",
        );
        router.replace(
          `/admin/cohorts/${cohortId}/milestones/${resolution.draftId}`,
        );
        return;
      }

      if (hadDraftId) {
        showInfoToast(
          "Saved milestone not found — continuing with draft as a new milestone.",
        );
      }

      hydrateDraft(!hadDraftId);
    };

    resolveDraft();

    return () => {
      cancelled = true;
    };
  }, [isEditing, adminFetch, silentFetch, router, cohortId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchExistingTasks = useCallback(async () => {
    if (!milestone?.id) {
      log.debug("[DEBUG] fetchExistingTasks: No milestone ID, returning early");
      return;
    }

    const apiUrl = `/api/admin/tasks/by-milestone?milestone_id=${milestone.id}`;

    try {
      const result = await adminFetch(apiUrl);

      if (result.error) {
        return;
      }

      // Access the nested data structure: result.data.data contains the actual task array
      const tasksData = result.data?.data || [];

      if (tasksData && tasksData.length > 0) {
        const existingTasks = tasksData.map((task: any) => ({
          id: task.id,
          title: task.title,
          description: task.description || "",
          reward_amount: task.reward_amount,
          order_index: task.order_index,
          task_type: task.task_type || "file_upload",
          contract_network: task.contract_network || "",
          contract_address: task.contract_address || "",
          contract_method: task.contract_method || "",
          _isFromDatabase: true, // Mark as from database
        }));
        setTasks(existingTasks);
      } else {
        // No existing tasks, ensure we have at least one empty task
      }
    } catch (err) {
      log.error("Error fetching existing tasks:", err);
    }
  }, [milestone?.id, adminFetch]);

  useAdminFetchOnce({
    authenticated,
    isAdmin,
    walletKey: user?.wallet?.address || null,
    keys: [milestone?.id],
    fetcher: fetchExistingTasks,
    enabled: isEditing && !!milestone?.id,
  });

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "duration_hours" ? parseInt(value) || 0 : value,
    }));
  };

  const addTask = () => {
    setTasks((prev) => [
      ...prev,
      {
        id: getRecordId(false),
        title: "",
        description: "",
        reward_amount: 0,
        order_index: prev.length,
        task_type: "file_upload",
        contract_network: "",
        contract_address: "",
        contract_method: "",
        _isFromDatabase: false, // Mark as new task
      },
    ]);
  };

  const handleRemoveTask = (taskId: string) => {
    // Show confirmation dialog before removing
    setTaskToDelete(taskId);
    setShowDeleteConfirmation(true);
  };

  const confirmTaskDeletion = async () => {
    if (!taskToDelete) return;

    setIsDeletingTask(true);
    try {
      // If it's an existing task from database, add to deleted list
      const taskToDeleteObj = tasks.find((task) => task.id === taskToDelete);
      if (taskToDeleteObj && taskToDeleteObj._isFromDatabase === true) {
        setDeletedTasks((prev) => [...prev, taskToDelete]);
      }

      // Remove from current tasks
      setTasks((prev) => prev.filter((task) => task.id !== taskToDelete));
      setShowDeleteConfirmation(false);
      setTaskToDelete(null);
    } catch (error) {
      log.error("Error removing task:", error);
    } finally {
      setIsDeletingTask(false);
    }
  };

  const updateTask = (taskId: string, field: keyof TaskForm, value: any) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, [field]: value } : task,
      ),
    );
  };

  // Deploy lock for the milestone
  const deployLockForMilestone = async (): Promise<
    | {
        lockAddress: string;
        grantFailed?: boolean;
        grantError?: string;
        configFailed?: boolean;
        configError?: string;
        transferConfigFailed?: boolean;
        transferConfigError?: string;
      }
    | undefined
  > => {
    if (!wallet) {
      toast.error("Please connect your wallet to deploy the lock");
      return undefined;
    }

    if (!formData.name) {
      toast.error("Please enter milestone name before deploying lock");
      return undefined;
    }

    setIsDeployingLock(true);
    setDeploymentStep("Checking network...");

    try {
      setDeploymentStep("Preparing lock configuration...");

      // Generate lock config from milestone data
      const lockConfig = generateMilestoneLockConfig(
        formData as CohortMilestone,
        totalTaskReward,
      );
      const deployConfig = createLockConfigWithManagers(lockConfig);

      // Convert to AdminLockDeploymentParams
      const params = convertLockConfigToDeploymentParams(deployConfig, isAdmin);

      setDeploymentStep("Deploying lock on blockchain...");
      toast.loading("Deploying milestone access lock...", {
        id: "milestone-lock-deploy",
      });

      // Deploy the lock using admin hook
      const result = await deployAdminLock(params);

      if (!result.success || !result.lockAddress) {
        throw new Error(result.error || "Lock deployment failed");
      }

      setDeploymentStep("Granting server wallet manager role...");

      const lockAddress = result.lockAddress;

      // Check if grant or config failed
      if (result.grantFailed) {
        setDeploymentStep("Lock deployed but grant manager failed!");
        setLockManagerGranted(false);
        setGrantFailureReason(
          result.grantError || "Grant manager transaction failed",
        );
        log.warn("Lock deployed but grant manager transaction failed", {
          lockAddress,
          grantError: result.grantError,
          lockManagerGranted: false,
        });
      } else if (result.configFailed) {
        setDeploymentStep("Lock deployed but config update failed!");
        setLockManagerGranted(true);
        setGrantFailureReason(undefined);
        log.warn("Lock deployed but config update failed", {
          lockAddress,
          configError: result.configError,
        });
      } else if (result.transferConfigFailed) {
        setDeploymentStep("Lock deployed but transferability update failed!");
        setLockManagerGranted(true);
        setGrantFailureReason(undefined);
        log.warn("Lock deployed but transferability update failed", {
          lockAddress,
          transferError: result.transferConfigError,
        });
      } else {
        setDeploymentStep("Lock deployed and configured successfully!");
        setLockManagerGranted(true);
        setGrantFailureReason(undefined);
        log.info("Lock deployed and grant manager successful", {
          lockAddress,
          lockManagerGranted: true,
        });
      }

      // Set max keys security state based on config outcome
      setMaxKeysSecured(!result.configFailed);
      setMaxKeysFailureReason(result.configError);

      // Set transferability security state based on transfer config outcome
      setTransferabilitySecured(!result.transferConfigFailed);
      setTransferabilityFailureReason(result.transferConfigError);
      if (result.transferConfigFailed) {
        log.warn("Lock deployed but transferability update failed", {
          lockAddress,
          transferError: result.transferConfigError,
        });
      }

      // Update draft with deployment result to preserve it in case of database failure
      updateDraftWithDeploymentResult("milestone", {
        lockAddress,
        grantFailed: result.grantFailed,
        grantError: result.grantError,
      });

      // Fetch parent cohort to store its lock address for Web3-native recovery
      let parentCohortLockAddress: string | null = null;
      try {
        const cohortResponse = await silentFetch<{
          success: boolean;
          data?: any;
        }>(`/api/admin/cohorts?id=${cohortId}`);
        if (cohortResponse.data?.data?.lock_address) {
          parentCohortLockAddress = cohortResponse.data.data.lock_address;
        }
      } catch (error) {
        log.warn("Failed to fetch parent cohort lock address", {
          cohortId,
          error,
        });
      }

      // Enhance entityData with parent cohort's lock address and tasks for reliable recovery
      const enhancedEntityData = {
        ...formData,
        parent_cohort_lock_address: parentCohortLockAddress,
        tasks: tasks.filter((task) => task.title && task.title.trim()), // Include valid tasks
      };

      // Save deployment state before database operation with both transaction hashes
      const deploymentId = savePendingDeployment({
        lockAddress,
        entityType: "milestone",
        entityData: enhancedEntityData,
        transactionHash: result.transactionHash,
        grantTransactionHash: result.grantTransactionHash,
        serverWalletAddress: result.serverWalletAddress,
        blockExplorerUrl: result.transactionHash
          ? getBlockExplorerUrl(result.transactionHash)
          : undefined,
      });

      if (result.grantFailed) {
        toast(
          <>
            Milestone lock deployed successfully!
            <br />
            ⚠️ Grant manager role failed - you can retry from milestone details
            page.
            <br />
            {result.transactionHash && (
              <a
                href={getBlockExplorerUrl(result.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View deployment
              </a>
            )}
          </>,
          {
            id: "milestone-lock-deploy",
            duration: 8000,
            icon: "⚠️",
          },
        );
      } else {
        toast.success(
          <>
            Milestone lock deployed successfully!
            <br />
            Server wallet granted manager role.
            <br />
            {result.transactionHash && (
              <>
                <a
                  href={getBlockExplorerUrl(result.transactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View deployment
                </a>
                <br />
              </>
            )}
            {result.grantTransactionHash && (
              <a
                href={getBlockExplorerUrl(result.grantTransactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View grant
              </a>
            )}
          </>,
          {
            id: "milestone-lock-deploy",
            duration: 5000,
          },
        );
      }

      log.info("Milestone lock deployed:", {
        lockAddress,
        transactionHash: result.transactionHash,
        grantTransactionHash: result.grantTransactionHash,
        serverWalletAddress: result.serverWalletAddress,
        deploymentId,
        grantFailed: result.grantFailed,
        grantError: result.grantError,
      });

      return {
        lockAddress,
        grantFailed: result.grantFailed,
        grantError: result.grantError,
      };
    } catch (error: any) {
      log.error("Milestone lock deployment failed:", error);
      const errorMessage = error.message || "Failed to deploy lock";
      toast.error(formatErrorMessageForToast(errorMessage), {
        id: "milestone-lock-deploy",
      });
      setDeploymentStep("");
      throw error;
    } finally {
      setIsDeployingLock(false);
    }
  };

  // Calculate total reward from tasks
  const totalTaskReward = tasks.reduce(
    (sum, task) => sum + (task.reward_amount || 0),
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    deploymentOutcomeRef.current = {};

    try {
      // Validate required fields
      if (!formData.name || !formData.description) {
        throw new Error("Name and description are required");
      }

      // Validate tasks
      const validTasks = tasks.filter(
        (task) => task.title && task.title.trim(),
      );

      if (validTasks.length === 0) {
        throw new Error("At least one task with a title is required");
      }

      // Validate task reward amounts
      const hasInvalidRewards = validTasks.some(
        (task) =>
          task.reward_amount === undefined ||
          task.reward_amount === null ||
          task.reward_amount < 0,
      );
      if (hasInvalidRewards) {
        throw new Error(
          "All tasks must have a valid reward amount (0 or greater)",
        );
      }

      // Validate contract interaction tasks
      const contractTasks = validTasks.filter(
        (task) => task.task_type === "contract_interaction",
      );
      for (const task of contractTasks) {
        if (!task.contract_network) {
          throw new Error(
            `Contract interaction task "${task.title}" requires a network selection`,
          );
        }
        if (!task.contract_address) {
          throw new Error(
            `Contract interaction task "${task.title}" requires a contract address`,
          );
        }
        if (!task.contract_method) {
          throw new Error(
            `Contract interaction task "${task.title}" requires a contract method`,
          );
        }
        // Validate Ethereum address format
        if (!/^0x[a-fA-F0-9]{40}$/.test(task.contract_address)) {
          throw new Error(
            `Contract interaction task "${task.title}" has an invalid contract address format`,
          );
        }
      }

      // If both dates are provided, validate them
      if (formData.start_date && formData.end_date) {
        const startDate = new Date(formData.start_date);
        const endDate = new Date(formData.end_date);

        if (endDate <= startDate) {
          throw new Error("End date must be after start date");
        }
      }

      const now = new Date().toISOString();
      let lockAddress = formData.lock_address || "";

      // Save draft before starting deployment (for new milestones)
      if (!isEditing) {
        const draftPayload = {
          ...formData,
          auto_lock_creation: showAutoLockCreation,
          tasks,
        };
        saveDraft("milestone", draftPayload);
      }

      // Deploy lock if not editing and auto-creation is enabled and no lock address provided
      if (
        !isEditing &&
        showAutoLockCreation &&
        !lockAddress &&
        totalTaskReward > 0
      ) {
        try {
          log.info("Auto-deploying lock for milestone...");
          const deploymentResult = await deployLockForMilestone();

          if (!deploymentResult || !deploymentResult.lockAddress) {
            throw new Error("Lock deployment failed");
          }

          lockAddress = deploymentResult.lockAddress;

          // Reflect grant result explicitly (and record outcome locally for this submit)
          const outcome = applyDeploymentOutcome(deploymentResult);
          setLockManagerGranted(outcome.granted);
          setGrantFailureReason(outcome.reason);
          deploymentOutcomeRef.current.grantFailed = outcome.lastGrantFailed;
          deploymentOutcomeRef.current.grantError = outcome.lastGrantError;
          if (outcome.lastGrantFailed) {
            log.warn("Milestone will be created with grant failure flag", {
              lockAddress,
              grantError: outcome.lastGrantError,
            });
          }

          // Set max keys security state based on config outcome
          setMaxKeysSecured(!deploymentResult.configFailed);
          setMaxKeysFailureReason(deploymentResult.configError);
          deploymentOutcomeRef.current.configFailed =
            deploymentResult.configFailed;
          deploymentOutcomeRef.current.configError =
            deploymentResult.configError;
          if (deploymentResult.configFailed) {
            log.warn("Milestone will be created with config failure flag", {
              lockAddress,
              configError: deploymentResult.configError,
            });
          }

          // Set transferability security state based on transfer config outcome
          setTransferabilitySecured(!deploymentResult.transferConfigFailed);
          setTransferabilityFailureReason(deploymentResult.transferConfigError);
          deploymentOutcomeRef.current.transferFailed =
            deploymentResult.transferConfigFailed;
          deploymentOutcomeRef.current.transferError =
            deploymentResult.transferConfigError;
          if (deploymentResult.transferConfigFailed) {
            log.warn(
              "Milestone will be created with transferability failure flag",
              {
                lockAddress,
                transferError: deploymentResult.transferConfigError,
              },
            );
          }
        } catch (deployError: any) {
          // If lock deployment fails, don't create the milestone
          throw new Error(`Lock deployment failed: ${deployError.message}`);
        }
      }

      // Prepare milestone data
      const {
        tasks: formTasks,
        auto_lock_creation: formAutoLockCreation,
        ...formDataWithoutTasks
      } = (formData || {}) as Partial<CohortMilestone> & {
        tasks?: TaskForm[];
        auto_lock_creation?: boolean;
      };

      if (formTasks) {
        log.debug("Omitting tasks from milestone payload", {
          taskCount: Array.isArray(formTasks)
            ? formTasks.length
            : typeof formTasks,
        });
      }

      if (typeof formAutoLockCreation !== "undefined") {
        log.debug("Dropping auto_lock_creation flag from milestone payload");
      }

      // Use effective values for this submit to avoid relying on async state updates
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

      log.info("Preparing milestone data for save", {
        lockAddress,
        lockManagerGranted,
        grantFailureReason,
        hasLockAddress: !!lockAddress,
        isEditing,
        hasDeploymentOutcome,
        shouldIncludeMaxKeysFields,
        effectiveMaxKeysSecured: effectiveMaxKeys.secured,
        effectiveMaxKeysReason: effectiveMaxKeys.reason,
        shouldIncludeTransferabilityFields,
        effectiveTransferabilitySecured: effectiveTransferability.secured,
        effectiveTransferabilityReason: effectiveTransferability.reason,
      });

      const milestoneData: any = {
        ...formDataWithoutTasks,
        name: formDataWithoutTasks.name || "",
        description: formDataWithoutTasks.description || "",
        start_date: formDataWithoutTasks.start_date || null,
        end_date: formDataWithoutTasks.end_date || null,
        lock_address: lockAddress,
        prerequisite_milestone_id:
          formDataWithoutTasks.prerequisite_milestone_id || null,
        duration_hours: formDataWithoutTasks.duration_hours || 0,
        total_reward: totalTaskReward,
        lock_manager_granted: effective.granted,
        grant_failure_reason: effective.reason,
        updated_at: now,
      };

      // Only include max_keys fields if creating new milestone or if there was a deployment
      if (shouldIncludeMaxKeysFields) {
        milestoneData.max_keys_secured = effectiveMaxKeys.secured;
        milestoneData.max_keys_failure_reason = effectiveMaxKeys.reason;
      } else {
        log.debug(
          "Omitting max_keys fields from edit payload to preserve DB state",
          {
            milestoneId: milestone?.id,
            currentHookState: {
              maxKeysSecured,
              maxKeysFailureReason,
            },
          },
        );
      }

      if (shouldIncludeTransferabilityFields) {
        milestoneData.transferability_secured =
          effectiveTransferability.secured;
        milestoneData.transferability_failure_reason =
          effectiveTransferability.reason;
      } else {
        log.debug(
          "Omitting transferability fields from edit payload to preserve DB state",
          {
            milestoneId: milestone?.id,
            currentHookState: {
              transferabilitySecured,
              transferabilityFailureReason,
            },
          },
        );
      }

      // Include created_at when creating new milestone
      if (!isEditing) {
        (milestoneData as any).created_at = now;
      }

      const allowedMilestoneKeys = new Set<string>([
        "id",
        "cohort_id",
        "name",
        "description",
        "order_index",
        "start_date",
        "end_date",
        "lock_address",
        "prerequisite_milestone_id",
        "duration_hours",
        "total_reward",
        "lock_manager_granted",
        "grant_failure_reason",
        "max_keys_secured",
        "max_keys_failure_reason",
        "transferability_secured",
        "transferability_failure_reason",
        "created_at",
        "updated_at",
        "old_id_text",
      ]);

      const invalidKeys = Object.keys(milestoneData).filter(
        (key) => !allowedMilestoneKeys.has(key),
      );

      if (invalidKeys.length > 0) {
        log.warn("Removing unsupported milestone payload keys", {
          invalidKeys,
        });
      }

      const sanitizedMilestoneData = Object.fromEntries(
        Object.entries(milestoneData).filter(([key]) =>
          allowedMilestoneKeys.has(key),
        ),
      );

      // Submit milestone
      const milestoneResult = await adminFetch("/api/admin/milestones", {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(sanitizedMilestoneData),
      });

      if (milestoneResult.error) {
        throw new Error(milestoneResult.error);
      }
      const milestoneId = milestoneResult.data?.id || formData.id;

      // Delete removed tasks first
      if (deletedTasks.length > 0) {
        for (const taskId of deletedTasks) {
          const deleteResult = await adminFetch(
            `/api/admin/milestone-tasks?id=${taskId}`,
            {
              method: "DELETE",
            },
          );

          if (deleteResult.error) {
            log.error("Failed to delete task:", deleteResult.error);
            // Continue with other operations but log the error
          }
        }
      }

      // Process tasks: separate existing tasks from new tasks
      const existingTasks = validTasks.filter(
        (task) => task._isFromDatabase === true,
      );
      const newTasks = validTasks.filter(
        (task) => task._isFromDatabase !== true,
      );

      // Update existing tasks using PUT
      for (const task of existingTasks) {
        const taskData = {
          id: task.id,
          title: task.title,
          description: task.description || "",
          reward_amount: task.reward_amount,
          task_type: task.task_type,
          contract_network:
            task.task_type === "contract_interaction"
              ? task.contract_network
              : null,
          contract_address:
            task.task_type === "contract_interaction"
              ? task.contract_address
              : null,
          contract_method:
            task.task_type === "contract_interaction"
              ? task.contract_method
              : null,
          milestone_id: milestoneId,
          order_index: validTasks.indexOf(task),
          updated_at: now,
        };

        const updateResult = await adminFetch("/api/admin/milestone-tasks", {
          method: "PUT",
          body: JSON.stringify(taskData),
        });

        if (updateResult.error) {
          throw new Error(`Failed to update task: ${updateResult.error}`);
        }
      }

      // Create new tasks using POST
      if (newTasks.length > 0) {
        const newTasksData = newTasks.map((task) => ({
          id: getRecordId(false),
          title: task.title,
          description: task.description || "",
          reward_amount: task.reward_amount,
          task_type: task.task_type,
          contract_network:
            task.task_type === "contract_interaction"
              ? task.contract_network
              : null,
          contract_address:
            task.task_type === "contract_interaction"
              ? task.contract_address
              : null,
          contract_method:
            task.task_type === "contract_interaction"
              ? task.contract_method
              : null,
          milestone_id: milestoneId,
          order_index: validTasks.indexOf(task),
          created_at: now,
          updated_at: now,
        }));

        const createResult = await adminFetch("/api/admin/milestone-tasks", {
          method: "POST",
          body: JSON.stringify({ tasks: newTasksData, milestoneId }),
        });

        if (createResult.error) {
          throw new Error(`Failed to create tasks: ${createResult.error}`);
        }
      }

      // Clean up drafts on success (for new milestones)
      if (!isEditing) {
        removeDraft("milestone");
      }

      // Clean up deleted tasks list after successful submission
      setDeletedTasks([]);

      // Call success handler
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err: any) {
      log.error("Error saving milestone:", err);
      setError(err.message || "Failed to save milestone");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    "bg-transparent border-gray-700 text-gray-100 placeholder-gray-500 focus:border-flame-yellow/50";
  const dateInputClass = `${inputClass} [color-scheme:dark] cursor-pointer`;

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Milestone Basic Info */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-white">Milestone Details</h3>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name" className="text-white">
              Milestone Name *
            </Label>
            <Input
              id="name"
              name="name"
              value={formData.name || ""}
              onChange={handleChange}
              placeholder="e.g., Week 1: Introduction to Web3"
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duration_hours" className="text-white">
              Duration (Hours) *
            </Label>
            <Input
              id="duration_hours"
              name="duration_hours"
              type="number"
              min="1"
              value={formData.duration_hours || ""}
              onChange={handleChange}
              placeholder="8"
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="description" className="text-white">
              Description *
            </Label>
            <Textarea
              id="description"
              name="description"
              value={formData.description || ""}
              onChange={handleChange}
              rows={3}
              placeholder="Enter milestone description"
              required
              className={inputClass}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prerequisite_milestone_id" className="text-white">
              Prerequisite Milestone
            </Label>
            <select
              id="prerequisite_milestone_id"
              name="prerequisite_milestone_id"
              value={formData.prerequisite_milestone_id || ""}
              onChange={handleChange}
              className={`${inputClass} w-full h-10 rounded-md px-3`}
            >
              <option value="">None (First milestone)</option>
              {existingMilestones
                .sort((a, b) => a.order_index - b.order_index)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Total Reward</Label>
            <div className="bg-gray-800 border border-gray-700 rounded-md p-3">
              <span className="text-flame-yellow text-lg font-semibold">
                {totalTaskReward.toLocaleString()} DG
              </span>
              <p className="text-sm text-gray-400 mt-1">
                Calculated from task rewards
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date" className="text-white">
              Start Date
            </Label>
            <Input
              id="start_date"
              name="start_date"
              type="date"
              value={formData.start_date || ""}
              onChange={handleChange}
              className={dateInputClass}
              onClick={(e) => e.currentTarget.showPicker()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="end_date" className="text-white">
              End Date
            </Label>
            <Input
              id="end_date"
              name="end_date"
              type="date"
              value={formData.end_date || ""}
              onChange={handleChange}
              className={dateInputClass}
              onClick={(e) => e.currentTarget.showPicker()}
            />
          </div>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Tasks</h3>
          <Button
            type="button"
            onClick={addTask}
            variant="outline"
            size="sm"
            className="border-flame-yellow text-flame-yellow hover:bg-flame-yellow/10"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>

        <div className="space-y-4">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="bg-card border border-gray-800 rounded-lg p-4"
            >
              <div className="flex items-start justify-between mb-4">
                <h4 className="text-white font-medium">Task {index + 1}</h4>
                {tasks.length > 1 && (
                  <Button
                    type="button"
                    onClick={() => handleRemoveTask(task.id)}
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Task Type Selection */}
                <div>
                  <Label className="text-white text-sm">Task Type *</Label>
                  <select
                    value={task.task_type}
                    onChange={(e) =>
                      updateTask(
                        task.id,
                        "task_type",
                        e.target.value as TaskType,
                      )
                    }
                    className={`${inputClass} w-full h-10 rounded-md px-3 mt-1`}
                  >
                    {TASK_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {
                      TASK_TYPES.find((t) => t.value === task.task_type)
                        ?.description
                    }
                  </p>
                </div>

                {/* Basic Task Fields */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <Label className="text-white text-sm">Task Title *</Label>
                    <Input
                      value={task.title}
                      onChange={(e) =>
                        updateTask(task.id, "title", e.target.value)
                      }
                      placeholder="e.g., Create a Web3 wallet"
                      className={`${inputClass} mt-1`}
                    />
                  </div>

                  <div>
                    <Label className="text-white text-sm">Reward (DG) *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={task.reward_amount || ""}
                      onChange={(e) =>
                        updateTask(
                          task.id,
                          "reward_amount",
                          e.target.value === "" ? 0 : Number(e.target.value),
                        )
                      }
                      placeholder="100"
                      className={`${inputClass} mt-1`}
                    />
                  </div>
                </div>

                {/* Contract Interaction Fields - Only show for contract_interaction tasks */}
                {task.task_type === "contract_interaction" && (
                  <div className="bg-blue-900/20 border border-blue-700/50 rounded-lg p-4">
                    <h5 className="text-blue-300 font-medium mb-3 flex items-center">
                      <Zap className="h-4 w-4 mr-2" />
                      Contract Interaction Configuration
                    </h5>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label className="text-white text-sm">Network *</Label>
                        <select
                          value={task.contract_network || ""}
                          onChange={(e) =>
                            updateTask(
                              task.id,
                              "contract_network",
                              e.target.value,
                            )
                          }
                          className={`${inputClass} w-full h-10 rounded-md px-3 mt-1`}
                          required
                        >
                          <option value="">Select network</option>
                          {AVAILABLE_NETWORKS.map((network) => (
                            <option key={network.value} value={network.value}>
                              {network.label} (Chain ID: {network.chainId})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <Label className="text-white text-sm">
                          Contract Address *
                        </Label>
                        <Input
                          value={task.contract_address || ""}
                          onChange={(e) =>
                            updateTask(
                              task.id,
                              "contract_address",
                              e.target.value,
                            )
                          }
                          placeholder="0x1234..."
                          className={`${inputClass} mt-1`}
                          pattern="^0x[a-fA-F0-9]{40}$"
                          title="Please enter a valid Ethereum address"
                          required
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label className="text-white text-sm">
                          Contract Method *
                        </Label>
                        <Input
                          value={task.contract_method || ""}
                          onChange={(e) =>
                            updateTask(
                              task.id,
                              "contract_method",
                              e.target.value,
                            )
                          }
                          placeholder="e.g., mint, approve, transfer"
                          className={`${inputClass} mt-1`}
                          required
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          The function name from the contract&apos;s ABI that
                          users should interact with
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Task Description */}
                <div>
                  <Label className="text-white text-sm">Description</Label>
                  <Textarea
                    value={task.description}
                    onChange={(e) =>
                      updateTask(task.id, "description", e.target.value)
                    }
                    placeholder="Provide instructions for completing this task..."
                    rows={task.task_type === "contract_interaction" ? 3 : 2}
                    className={`${inputClass} mt-1`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Lock Configuration */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Lock Configuration</h3>

        {!isEditing && (
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-white font-medium">
                  Automatic Lock Deployment
                </h4>
                <p className="text-sm text-gray-400">
                  Deploy an Unlock Protocol lock for this milestone&apos;s NFT
                  badges
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={showAutoLockCreation}
                    onChange={(e) => setShowAutoLockCreation(e.target.checked)}
                    className="w-4 h-4 text-flame-yellow bg-transparent border-gray-600 rounded focus:ring-flame-yellow focus:ring-2"
                  />
                  <span className="text-white text-sm">Auto-deploy</span>
                </label>
                {showAutoLockCreation &&
                  !formData.lock_address &&
                  totalTaskReward > 0 && (
                    <Button
                      type="button"
                      onClick={deployLockForMilestone}
                      disabled={isDeployingLock || !wallet}
                      variant="outline"
                      size="sm"
                      className="border-flame-yellow text-flame-yellow hover:bg-flame-yellow/10"
                    >
                      {isDeployingLock ? (
                        <>
                          <div className="mr-2 h-3 w-3 animate-spin rounded-full border-2 border-t-transparent"></div>
                          Deploying...
                        </>
                      ) : (
                        <>Deploy Now</>
                      )}
                    </Button>
                  )}
              </div>
            </div>

            {isDeployingLock && deploymentStep && (
              <div className="bg-blue-900/20 border border-blue-700 rounded p-3 mb-3">
                <p className="text-blue-300 text-sm font-medium">
                  {deploymentStep}
                </p>
              </div>
            )}

            {showAutoLockCreation && totalTaskReward > 0 && (
              <div className="text-xs text-gray-400 bg-gray-900/50 rounded p-3">
                <p className="mb-1">
                  ✨ A new lock will be automatically deployed for this
                  milestone using your connected wallet
                </p>
                <p>• Lock will be configured for milestone NFT badges</p>
                <p>
                  • Total reward amount: {totalTaskReward.toLocaleString()} DG
                </p>
                <p>• Price: Free (0 ETH) - rewards distributed manually</p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="lock_address" className="text-white">
            Lock Address{" "}
            {!isEditing && showAutoLockCreation ? "(Auto-generated)" : ""}
          </Label>
          <Input
            id="lock_address"
            name="lock_address"
            value={formData.lock_address || ""}
            onChange={handleChange}
            placeholder={
              !isEditing && showAutoLockCreation
                ? "Will be auto-generated on creation"
                : "e.g., 0x1234..."
            }
            className={inputClass}
            disabled={!isEditing && showAutoLockCreation}
          />

          {/* Lock Manager Status Toggle */}
          <LockManagerToggle
            isGranted={lockManagerGranted}
            onToggle={setLockManagerGranted}
            lockAddress={formData.lock_address}
            isEditing={isEditing}
          />

          <p className="text-sm text-gray-400">
            {!isEditing && showAutoLockCreation
              ? "Lock address will be automatically generated during milestone creation"
              : "Optional: Unlock Protocol lock address for milestone NFT badges"}
          </p>
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <Button
          type="button"
          variant="outline"
          className="border-gray-700 text-white hover:bg-gray-800"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || isDeployingFromHook}
          className="bg-steel-red hover:bg-steel-red/90 text-white"
        >
          {isSubmitting || isDeployingFromHook ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
              {isDeployingFromHook
                ? "Deploying Lock..."
                : isEditing
                  ? "Updating..."
                  : "Creating..."}
            </>
          ) : (
            <>{isEditing ? "Update Milestone" : "Create Milestone"}</>
          )}
        </Button>
      </div>

      <ConfirmationDialog
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={confirmTaskDeletion}
        isLoading={isDeletingTask}
        title="Confirm Task Deletion"
        description="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete Task"
        variant="danger"
      />
    </form>
  );
}

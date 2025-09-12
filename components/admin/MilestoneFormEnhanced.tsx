import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Zap } from "lucide-react";
import type { CohortMilestone } from "@/lib/supabase/types";
import { getRecordId } from "@/lib/utils/id-generation";
import { usePrivy } from "@privy-io/react-auth";
import { useWallets } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { unlockUtils } from "@/lib/unlock/lockUtils";
import {
  generateMilestoneLockConfig,
  createLockConfigWithManagers,
} from "@/lib/blockchain/admin-lock-config";
import { getBlockExplorerUrl } from "@/lib/blockchain/transaction-helpers";
import { getLogger } from "@/lib/utils/logger";
import {
  savePendingDeployment,
  getDraft,
  saveDraft,
  removeDraft,
} from "@/lib/utils/lock-deployment-state";

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

export default function MilestoneFormEnhanced({
  cohortId,
  milestone,
  existingMilestones = [],
  onSubmitSuccess,
  onCancel,
}: MilestoneFormEnhancedProps) {
  const isEditing = !!milestone;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeployingLock, setIsDeployingLock] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState("");
  const [showAutoLockCreation, setShowAutoLockCreation] = useState(!isEditing);
  const [error, setError] = useState<string | null>(null);
  const { getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];

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
    },
  ]);

  // Load existing tasks when editing a milestone
  useEffect(() => {
    if (isEditing && milestone?.id) {
      fetchExistingTasks();
    }
  }, [isEditing, milestone?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load draft data on mount for new milestones
  useEffect(() => {
    if (!isEditing) {
      const draft = getDraft("milestone");
      if (draft) {
        setFormData((prev) => ({ ...prev, ...draft.formData }));
        if (draft.formData.tasks) {
          setTasks(draft.formData.tasks);
        }
        toast.success("Restored draft data");
      }
    }
  }, [isEditing]);

  const fetchExistingTasks = async () => {
    try {
      const response = await fetch(
        `/api/admin/milestone-tasks?milestone_id=${milestone?.id}`,
      );
      if (response.ok) {
        const result = await response.json();
        if (result.data && result.data.length > 0) {
          const existingTasks = result.data.map((task: any) => ({
            id: task.id,
            title: task.title,
            description: task.description || "",
            reward_amount: task.reward_amount,
            order_index: task.order_index,
            task_type: task.task_type || "file_upload",
            contract_network: task.contract_network || "",
            contract_address: task.contract_address || "",
            contract_method: task.contract_method || "",
          }));
          setTasks(existingTasks);
        }
      }
    } catch (err) {
      log.error("Error fetching existing tasks:", err);
    }
  };

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
      },
    ]);
  };

  const removeTask = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  const updateTask = (taskId: string, field: keyof TaskForm, value: any) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              [field]: field === "reward_amount" ? parseInt(value) || 0 : value,
            }
          : task,
      ),
    );
  };

  // Deploy lock for the milestone
  const deployLockForMilestone = async (): Promise<string | undefined> => {
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

      setDeploymentStep("Deploying lock on blockchain...");
      toast.loading("Deploying milestone access lock...", {
        id: "milestone-lock-deploy",
      });

      // Deploy the lock
      const result = await unlockUtils.deployLock(deployConfig, wallet);

      if (!result.success) {
        throw new Error(result.error || "Lock deployment failed");
      }

      // Get lock address from deployment result
      if (!result.lockAddress) {
        throw new Error(
          "Lock deployment succeeded but no lock address returned",
        );
      }

      const lockAddress = result.lockAddress;
      setDeploymentStep("Lock deployed successfully!");

      // Save deployment state before database operation
      const deploymentId = savePendingDeployment({
        lockAddress,
        entityType: "milestone",
        entityData: formData,
        transactionHash: result.transactionHash,
        blockExplorerUrl: result.transactionHash
          ? getBlockExplorerUrl(result.transactionHash)
          : undefined,
      });

      toast.success(
        <>
          Milestone lock deployed successfully!
          <br />
          {result.transactionHash && (
            <a
              href={getBlockExplorerUrl(result.transactionHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View transaction
            </a>
          )}
        </>,
        {
          id: "milestone-lock-deploy",
          duration: 5000,
        },
      );

      log.info("Milestone lock deployed:", {
        lockAddress,
        transactionHash: result.transactionHash,
        deploymentId,
      });

      return lockAddress;
    } catch (error: any) {
      log.error("Milestone lock deployment failed:", error);
      toast.error(error.message || "Failed to deploy lock", {
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
        saveDraft("milestone", { ...formData, tasks });
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
          const deployedLockAddress = await deployLockForMilestone();

          if (!deployedLockAddress) {
            throw new Error("Lock deployment failed");
          }

          lockAddress = deployedLockAddress;
        } catch (deployError: any) {
          // If lock deployment fails, don't create the milestone
          throw new Error(`Lock deployment failed: ${deployError.message}`);
        }
      }

      // Prepare milestone data
      const milestoneData = {
        ...formData,
        name: formData.name || "",
        description: formData.description || "",
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        lock_address: lockAddress,
        prerequisite_milestone_id: formData.prerequisite_milestone_id || null,
        duration_hours: formData.duration_hours || 0,
        total_reward: totalTaskReward,
        updated_at: now,
      };

      // Get Privy access token for authorization header
      const token = await getAccessToken();
      if (!token) throw new Error("Authentication required");

      // Include created_at when creating new milestone
      if (!isEditing) {
        (milestoneData as any).created_at = now;
      }

      // Submit milestone
      const milestoneResponse = await fetch("/api/admin/milestones", {
        method: isEditing ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(milestoneData),
      });

      if (!milestoneResponse.ok) {
        const errorData = await milestoneResponse.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to save milestone");
      }

      const milestoneResult = await milestoneResponse.json();
      const milestoneId =
        milestoneResult.id || milestoneResult.data?.id || formData.id;

      // Submit tasks
      const tasksData = validTasks.map((task, index) => ({
        id:
          task.id.startsWith("temp_") || task.id.length <= 10
            ? getRecordId(false)
            : task.id,
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
        order_index: index,
        created_at: now,
        updated_at: now,
      }));

      // Only submit tasks if there are valid tasks and a milestone ID
      if (validTasks.length > 0 && milestoneId) {
        const tasksResponse = await fetch("/api/admin/milestone-tasks", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ tasks: tasksData, milestoneId }),
        });

        if (!tasksResponse.ok) {
          const errorData = await tasksResponse.json().catch(() => null);
          throw new Error(errorData?.error || "Failed to save tasks");
        }
      }

      // Wait a moment for database to commit
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Clean up drafts on success (for new milestones)
      if (!isEditing) {
        removeDraft("milestone");
      }

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
                    onClick={() => removeTask(task.id)}
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
                        updateTask(task.id, "reward_amount", e.target.value)
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
          disabled={isSubmitting}
          className="bg-steel-red hover:bg-steel-red/90 text-white"
        >
          {isSubmitting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
              {isEditing ? "Updating..." : "Creating..."}
            </>
          ) : (
            <>{isEditing ? "Update Milestone" : "Create Milestone"}</>
          )}
        </Button>
      </div>
    </form>
  );
}

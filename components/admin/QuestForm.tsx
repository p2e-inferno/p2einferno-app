import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/ui/image-upload";
import QuestTaskForm from "@/components/admin/QuestTaskForm";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useSmartWalletSelection } from "../../hooks/useSmartWalletSelection";
import { PlusCircle, Coins, Save, X } from "lucide-react";
import { toast } from "react-hot-toast";
import { unlockUtils } from "@/lib/unlock/lockUtils";
import {
  generateQuestLockConfig,
  createLockConfigWithManagers,
} from "@/lib/blockchain/admin-lock-config";
import { getBlockExplorerUrl } from "@/lib/blockchain/transaction-helpers";
import {
  saveDraft,
  removeDraft,
  getDraft,
  updateDraftWithLockAddress,
  savePendingDeployment,
} from "@/lib/utils/lock-deployment-state";
import type { Quest, QuestTask } from "@/lib/supabase/types";
import { nanoid } from "nanoid";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:QuestForm");

interface QuestFormProps {
  quest?: Quest;
  isEditing?: boolean;
}

type TaskWithTempId = Partial<QuestTask> & { tempId?: string };

export default function QuestForm({
  quest,
  isEditing = false,
}: QuestFormProps) {
  const router = useRouter();
  const { adminFetch } = useAdminApi();
  const wallet = useSmartWalletSelection();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock deployment state
  const [isDeployingLock, setIsDeployingLock] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState<string>("");
  const [showAutoLockCreation, setShowAutoLockCreation] = useState(true);

  const [formData, setFormData] = useState({
    title: quest?.title || "",
    description: quest?.description || "",
    image_url: quest?.image_url || "",
    is_active: quest?.is_active ?? true,
    lock_address: quest?.lock_address || "",
  });

  // Load draft data on mount
  useEffect(() => {
    if (!isEditing) {
      const draft = getDraft("quest");
      if (draft) {
        setFormData((prev) => ({ ...prev, ...draft.formData }));

        // If draft contains a lock address, disable auto-creation
        if (draft.formData.lock_address) {
          setShowAutoLockCreation(false);
          toast.success("Restored draft data with deployed lock");
        } else {
          toast.success("Restored draft data");
        }
      }
    }
  }, [isEditing]);

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
  const deployLockForQuest = async (): Promise<string | undefined> => {
    if (!wallet) {
      toast.error("Please connect your wallet to deploy the lock");
      return undefined;
    }

    if (!formData.title) {
      toast.error("Please enter quest title before deploying lock");
      return undefined;
    }

    setIsDeployingLock(true);
    setDeploymentStep("Checking network...");

    try {
      setDeploymentStep("Preparing lock configuration...");

      // Generate lock config from quest data
      const questData = { ...formData, total_reward: totalReward } as Quest;
      const lockConfig = generateQuestLockConfig(questData);
      const deployConfig = createLockConfigWithManagers(lockConfig);

      setDeploymentStep("Deploying lock on blockchain...");
      toast.loading("Deploying quest completion lock...", {
        id: "lock-deploy",
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

      // Update draft with lock address to preserve it in case of database failure
      updateDraftWithLockAddress("quest", lockAddress);

      // Save deployment state before database operation
      const deploymentId = savePendingDeployment({
        lockAddress,
        entityType: "quest",
        entityData: { ...formData, total_reward: totalReward },
        transactionHash: result.transactionHash,
        blockExplorerUrl: result.transactionHash
          ? getBlockExplorerUrl(result.transactionHash)
          : undefined,
      });

      toast.success(
        <>
          Lock deployed successfully!
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
          id: "lock-deploy",
          duration: 5000,
        },
      );

      log.info("Lock deployed:", {
        lockAddress,
        transactionHash: result.transactionHash,
        deploymentId,
      });

      return lockAddress;
    } catch (error: any) {
      log.error("Lock deployment failed:", error);
      toast.error(error.message || "Failed to deploy lock", {
        id: "lock-deploy",
      });
      setDeploymentStep("");
      throw error;
    } finally {
      setIsDeployingLock(false);
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

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Save draft before starting deployment (for new quests)
      if (!isEditing) {
        saveDraft("quest", { ...formData, total_reward: totalReward });
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
          lockAddress = await deployLockForQuest();

          if (!lockAddress) {
            throw new Error("Lock deployment failed");
          }
        } catch (deployError: any) {
          // If lock deployment fails, don't create the quest
          throw new Error(`Lock deployment failed: ${deployError.message}`);
        }
      }

      const endpoint = isEditing
        ? `/api/admin/quests/${quest?.id}`
        : "/api/admin/quests";

      const method = isEditing ? "PUT" : "POST";

      // Prepare quest data
      const questData = {
        ...formData,
        lock_address: lockAddress,
        total_reward: totalReward,
      };

      // Prepare tasks data
      const tasksData = tasks.map((task) => {
        const { tempId, ...taskData } = task;
        return {
          ...taskData,
          quest_id: quest?.id, // Will be set by API for new quests
        };
      });

      const result = await adminFetch(endpoint, {
        method,
        body: JSON.stringify({
          ...questData,
          tasks: tasksData,
          xp_reward: questData.total_reward, // Map field name for API
          status: "active", // Default status
        }),
      });

      if (result.error) {
        throw new Error(result.error);
      }

      // Clean up drafts and pending deployments on success
      if (!isEditing) {
        removeDraft("quest");
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
    <form onSubmit={handleSubmit} className="space-y-8">
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Quest Basic Info */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-lg p-6 space-y-6">
        <h2 className="text-xl font-bold text-white mb-4">Quest Information</h2>

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
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Describe the quest objectives and what users will learn..."
              className="bg-transparent border-gray-700 text-gray-100"
              rows={4}
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
                Optional: Unlock Protocol lock address for quest completion
                certificates
              </p>
            )}

            {isDeployingLock && (
              <div className="bg-blue-900/20 border border-blue-700 text-blue-300 px-3 py-2 rounded mt-2">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-blue-300/20 border-t-blue-300 rounded-full animate-spin" />
                  <span className="text-sm">{deploymentStep}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData({ ...formData, is_active: e.target.checked })
              }
              className="rounded border-gray-700 bg-transparent text-flame-yellow focus:ring-flame-yellow"
              disabled={isSubmitting}
            />
            <Label htmlFor="is_active" className="text-white cursor-pointer">
              Quest is Active
            </Label>
          </div>
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
                onUpdate={(updatedTask) => handleUpdateTask(index, updatedTask)}
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
            <span className="text-white font-semibold">Total Quest Reward</span>
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
          disabled={isSubmitting}
          className="bg-steel-red hover:bg-steel-red/90 text-white"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin mr-2" />
              Saving...
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
  );
}

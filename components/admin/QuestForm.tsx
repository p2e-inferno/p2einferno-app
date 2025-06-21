import { useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ImageUpload from "@/components/ui/image-upload";
import QuestTaskForm from "@/components/admin/QuestTaskForm";
import { usePrivy } from "@privy-io/react-auth";
import { PlusCircle, Coins, Save, X } from "lucide-react";
import type { Quest, QuestTask } from "@/lib/supabase/types";
import { nanoid } from "nanoid";

interface QuestFormProps {
  quest?: Quest;
  isEditing?: boolean;
}

type TaskWithTempId = Partial<QuestTask> & { tempId?: string };

export default function QuestForm({ quest, isEditing = false }: QuestFormProps) {
  const router = useRouter();
  const { getAccessToken } = usePrivy();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: quest?.title || "",
    description: quest?.description || "",
    image_url: quest?.image_url || "",
    is_active: quest?.is_active ?? true,
  });

  const [tasks, setTasks] = useState<TaskWithTempId[]>(() => {
    if (quest?.quest_tasks) {
      return quest.quest_tasks.map((task, index) => ({
        ...task,
        tempId: `existing-${task.id}`,
        order_index: index
      }));
    }
    return [];
  });

  const totalReward = tasks.reduce((sum, task) => sum + (task.reward_amount || 0), 0);

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
      order_index: i
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
      order_index: i
    }));
    
    setTasks(reorderedTasks);
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
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      const endpoint = isEditing
        ? `/api/admin/quests/${quest?.id}`
        : "/api/admin/quests";
      
      const method = isEditing ? "PUT" : "POST";

      // Prepare quest data
      const questData = {
        ...formData,
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

      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          quest: questData,
          tasks: tasksData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Failed to save quest");
      }

      const result = await response.json();

      // Redirect to quest details page
      router.push(`/admin/quests/${result.quest.id}`);
    } catch (err: any) {
      console.error("Error saving quest:", err);
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
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
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
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Describe the quest objectives and what users will learn..."
              className="bg-transparent border-gray-700 text-gray-100"
              rows={4}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <ImageUpload
              value={formData.image_url}
              onChange={(url) => setFormData({ ...formData, image_url: url || "" })}
              disabled={isSubmitting}
              bucketName="quest-images"
            />
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
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
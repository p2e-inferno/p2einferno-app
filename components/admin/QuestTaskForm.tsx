import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Mail,
  Wallet,
  Share2,
  FileSignature,
  Link2,
  FileText,
  Camera,
  CheckCircle,
  Sparkles,
  GripVertical,
  Trash2,
} from "lucide-react";
import type {
  QuestTask,
  TaskType,
  InputValidationType,
} from "@/lib/supabase/types";

interface QuestTaskFormProps {
  task: Partial<QuestTask> & { tempId?: string };
  index: number;
  onUpdate: (task: Partial<QuestTask> & { tempId?: string }) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

const taskTypeOptions: {
  value: TaskType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: "link_email",
    label: "Link Email",
    icon: <Mail className="w-4 h-4" />,
    description: "User links their email address",
  },
  {
    value: "link_wallet",
    label: "Link Wallet",
    icon: <Wallet className="w-4 h-4" />,
    description: "User connects their Web3 wallet",
  },
  {
    value: "link_farcaster",
    label: "Link Farcaster",
    icon: <Share2 className="w-4 h-4" />,
    description: "User connects their Farcaster account",
  },
  {
    value: "sign_tos",
    label: "Sign Terms",
    icon: <FileSignature className="w-4 h-4" />,
    description: "User signs terms of service",
  },
  {
    value: "submit_url",
    label: "Submit URL",
    icon: <Link2 className="w-4 h-4" />,
    description: "User submits a URL (e.g., social post)",
  },
  {
    value: "submit_text",
    label: "Submit Text",
    icon: <FileText className="w-4 h-4" />,
    description: "User submits text response",
  },
  {
    value: "submit_proof",
    label: "Submit Proof",
    icon: <Camera className="w-4 h-4" />,
    description: "User submits proof (screenshot, etc.)",
  },
  {
    value: "complete_external",
    label: "External Task",
    icon: <CheckCircle className="w-4 h-4" />,
    description: "User completes external task",
  },
  {
    value: "custom",
    label: "Custom Task",
    icon: <Sparkles className="w-4 h-4" />,
    description: "Custom verification logic",
  },
];

const validationOptions: { value: InputValidationType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "number", label: "Number" },
  { value: "textarea", label: "Long Text" },
];

export default function QuestTaskForm({
  task,
  index,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: QuestTaskFormProps) {
  const [localTask, setLocalTask] = useState(task);
  const [showInputConfig, setShowInputConfig] = useState(false);

  useEffect(() => {
    // Show input config for task types that typically require input
    const inputTaskTypes: TaskType[] = [
      "submit_url",
      "submit_text",
      "submit_proof",
      "complete_external",
      "custom",
    ];
    setShowInputConfig(
      inputTaskTypes.includes(localTask.task_type as TaskType),
    );
  }, [localTask.task_type]);

  const handleChange = (field: keyof QuestTask, value: any) => {
    const updated = { ...localTask, [field]: value };
    setLocalTask(updated);
    onUpdate(updated);
  };

  const handleTaskTypeChange = (taskType: TaskType) => {
    const inputTaskTypes: TaskType[] = [
      "submit_url",
      "submit_text",
      "submit_proof",
      "complete_external",
      "custom",
    ];
    const requiresInput = inputTaskTypes.includes(taskType);

    const updated = {
      ...localTask,
      task_type: taskType,
      input_required: requiresInput,
      requires_admin_review: requiresInput,
      verification_method: requiresInput ? "manual_review" : "automatic",
    };

    // Set default input config based on task type
    if (taskType === "submit_url") {
      updated.input_validation = "url";
      updated.input_label = "URL";
      updated.input_placeholder = "https://...";
    } else if (taskType === "submit_text") {
      updated.input_validation = "textarea";
      updated.input_label = "Your Response";
      updated.input_placeholder = "Enter your response here...";
    }

    setLocalTask(updated);
    onUpdate(updated);
  };

  const selectedTaskType = taskTypeOptions.find(
    (t) => t.value === localTask.task_type,
  );

  return (
    <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-6 space-y-4">
      {/* Task Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="cursor-move text-gray-400 hover:text-white"
          >
            <GripVertical className="w-5 h-5" />
          </Button>
          <h3 className="text-lg font-semibold text-white">Task {index + 1}</h3>
          {selectedTaskType && (
            <div className="flex items-center gap-2 text-gray-400">
              {selectedTaskType.icon}
              <span className="text-sm">{selectedTaskType.label}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {canMoveUp && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveUp}
              className="text-gray-400 hover:text-white"
            >
              ↑
            </Button>
          )}
          {canMoveDown && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onMoveDown}
              className="text-gray-400 hover:text-white"
            >
              ↓
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Task Type Selection */}
      <div className="space-y-2">
        <Label className="text-white">Task Type</Label>
        <div className="grid grid-cols-3 gap-2">
          {taskTypeOptions.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => handleTaskTypeChange(type.value)}
              className={`flex items-center gap-2 p-3 rounded-lg border transition-all ${
                localTask.task_type === type.value
                  ? "border-flame-yellow bg-flame-yellow/10 text-white"
                  : "border-gray-700 hover:border-gray-600 text-gray-300"
              }`}
            >
              {type.icon}
              <span className="text-sm font-medium">{type.label}</span>
            </button>
          ))}
        </div>
        {selectedTaskType && (
          <p className="text-sm text-gray-400 mt-1">
            {selectedTaskType.description}
          </p>
        )}
      </div>

      {/* Basic Task Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`task-title-${index}`} className="text-white">
            Task Title
          </Label>
          <Input
            id={`task-title-${index}`}
            value={localTask.title || ""}
            onChange={(e) => handleChange("title", e.target.value)}
            placeholder="e.g., Share on Twitter"
            className="bg-transparent border-gray-700 text-gray-100"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`task-reward-${index}`} className="text-white">
            Reward Amount (DG)
          </Label>
          <Input
            id={`task-reward-${index}`}
            type="number"
            value={localTask.reward_amount || 0}
            onChange={(e) =>
              handleChange("reward_amount", parseInt(e.target.value) || 0)
            }
            placeholder="1000"
            className="bg-transparent border-gray-700 text-gray-100"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`task-description-${index}`} className="text-white">
          Task Description
        </Label>
        <Textarea
          id={`task-description-${index}`}
          value={localTask.description || ""}
          onChange={(e) => handleChange("description", e.target.value)}
          placeholder="Describe what the user needs to do..."
          className="bg-transparent border-gray-700 text-gray-100"
          rows={3}
        />
      </div>

      {/* Input Configuration */}
      {showInputConfig && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-800/50">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Input Configuration
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={`input-label-${index}`} className="text-white">
                Input Label
              </Label>
              <Input
                id={`input-label-${index}`}
                value={localTask.input_label || ""}
                onChange={(e) => handleChange("input_label", e.target.value)}
                placeholder="e.g., Twitter Post URL"
                className="bg-transparent border-gray-700 text-gray-100"
              />
            </div>

            <div className="space-y-2">
              <Label
                htmlFor={`input-validation-${index}`}
                className="text-white"
              >
                Validation Type
              </Label>
              <select
                id={`input-validation-${index}`}
                value={localTask.input_validation || "text"}
                onChange={(e) =>
                  handleChange(
                    "input_validation",
                    e.target.value as InputValidationType,
                  )
                }
                className="w-full px-3 py-2 bg-transparent border border-gray-700 rounded-md text-gray-100 focus:border-flame-yellow"
              >
                {validationOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    className="bg-gray-900"
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor={`input-placeholder-${index}`}
              className="text-white"
            >
              Placeholder Text
            </Label>
            <Input
              id={`input-placeholder-${index}`}
              value={localTask.input_placeholder || ""}
              onChange={(e) =>
                handleChange("input_placeholder", e.target.value)
              }
              placeholder="e.g., https://twitter.com/..."
              className="bg-transparent border-gray-700 text-gray-100"
            />
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id={`input-required-${index}`}
              checked={localTask.input_required || false}
              onChange={(e) => handleChange("input_required", e.target.checked)}
              className="rounded border-gray-700 bg-transparent text-flame-yellow focus:ring-flame-yellow"
            />
            <Label
              htmlFor={`input-required-${index}`}
              className="text-white cursor-pointer"
            >
              Input Required
            </Label>
          </div>

          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              id={`admin-review-${index}`}
              checked={localTask.requires_admin_review || false}
              onChange={(e) =>
                handleChange("requires_admin_review", e.target.checked)
              }
              className="rounded border-gray-700 bg-transparent text-flame-yellow focus:ring-flame-yellow"
            />
            <Label
              htmlFor={`admin-review-${index}`}
              className="text-white cursor-pointer"
            >
              Requires Admin Review
            </Label>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Toggle from "@/components/ui/toggle";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Coins,
  Flame,
  Network,
  ArrowUpCircle,
} from "lucide-react";
import { useDGMarket } from "@/hooks/vendor/useDGMarket";
import { getStageOptions } from "@/lib/blockchain/shared/vendor-constants";
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
  // Vendor Task Types
  {
    value: "vendor_buy",
    label: "Buy DG Tokens",
    icon: <Coins className="w-4 h-4" />,
    description: "User must buy DG tokens from vendor",
  },
  {
    value: "vendor_sell",
    label: "Sell DG Tokens",
    icon: <Coins className="w-4 h-4" />,
    description: "User must sell DG tokens to vendor",
  },
  {
    value: "vendor_light_up",
    label: "Light Up",
    icon: <Flame className="w-4 h-4" />,
    description: "User must execute Light Up action",
  },
  {
    value: "vendor_level_up",
    label: "Level Up / Upgrade Stage",
    icon: <ArrowUpCircle className="w-4 h-4" />,
    description: "User must reach a specific vendor stage",
  },
  {
    value: "deploy_lock",
    label: "Deploy Lock",
    icon: <Network className="w-4 h-4" />,
    description: "User must deploy an Unlock Protocol lock",
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
  const { minBuyAmount, minSellAmount } = useDGMarket();

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
    const vendorTaskTypes: TaskType[] = [
      "vendor_buy",
      "vendor_sell",
      "vendor_light_up",
      "vendor_level_up",
      "deploy_lock",
    ];

    const requiresInput = inputTaskTypes.includes(taskType);
    const isVendorTask = vendorTaskTypes.includes(taskType);

    const updated = {
      ...localTask,
      task_type: taskType,
      input_required: requiresInput,
      requires_admin_review: requiresInput && !isVendorTask,
      verification_method: isVendorTask
        ? "blockchain"
        : requiresInput
          ? "manual_review"
          : "automatic",
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

  const isVendorBuy = localTask.task_type === "vendor_buy";
  const isVendorSell = localTask.task_type === "vendor_sell";
  const isVendorLevelUp = localTask.task_type === "vendor_level_up";
  const isDeployLock = localTask.task_type === "deploy_lock";
  const vendorConfig = (localTask.task_config as Record<string, unknown>) || {};

  const updateTaskConfig = (updates: Record<string, unknown>) => {
    handleChange("task_config", { ...vendorConfig, ...updates });
  };

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
        <RichTextEditor
          value={localTask.description || ""}
          onChange={(next) => handleChange("description", next)}
          placeholder="Describe what the user needs to do..."
          className="border-gray-700"
          editorClassName="text-gray-100"
          minHeightClassName="min-h-[90px]"
        />
      </div>

      {(isVendorBuy || isVendorSell || isVendorLevelUp) && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-800/50">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Vendor Task Config
          </h4>

          {(isVendorBuy || isVendorSell) && (
            <>
              <div className="space-y-2">
                <Label
                  htmlFor={`required-amount-${index}`}
                  className="text-white"
                >
                  Minimum Required Amount ({isVendorBuy ? "UP" : "DG"})
                </Label>
                <Input
                  id={`required-amount-${index}`}
                  type="number"
                  min={0}
                  step="0.000000000000000001"
                  value={
                    vendorConfig.required_amount &&
                    typeof vendorConfig.required_amount === "string"
                      ? (
                          BigInt(vendorConfig.required_amount) /
                          BigInt(10 ** 18)
                        ).toString() +
                        (BigInt(vendorConfig.required_amount) %
                          BigInt(10 ** 18) >
                        0
                          ? "." +
                            (
                              BigInt(vendorConfig.required_amount) %
                              BigInt(10 ** 18)
                            )
                              .toString()
                              .padStart(18, "0")
                              .replace(/0+$/, "")
                          : "")
                      : ""
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "" || value === "0") {
                      // 0 or empty means any amount
                      updateTaskConfig({
                        required_amount: "0",
                        required_token: isVendorSell ? "swap" : "base",
                      });
                    } else {
                      // Convert to wei (multiply by 10^18)
                      const [whole, decimal] = value.split(".");
                      const wholeBigInt =
                        BigInt(whole || "0") * BigInt(10 ** 18);
                      const decimalBigInt = decimal
                        ? BigInt(decimal.padEnd(18, "0").slice(0, 18))
                        : BigInt(0);
                      const weiAmount = (
                        wholeBigInt + decimalBigInt
                      ).toString();
                      updateTaskConfig({
                        required_amount: weiAmount,
                        required_token: isVendorSell ? "swap" : "base",
                      });
                    }
                  }}
                  placeholder="0 for any amount"
                  className="bg-transparent border-gray-700 text-gray-100"
                />
                <p className="text-xs text-gray-400">
                  {isVendorBuy
                    ? `Contract minimum: ${minBuyAmount ? (BigInt(minBuyAmount.toString()) / BigInt(10 ** 18)).toString() : "unavailable"} UP`
                    : `Contract minimum: ${minSellAmount ? (BigInt(minSellAmount.toString()) / BigInt(10 ** 18)).toString() : "unavailable"} DG`}
                </p>
                <p className="text-xs text-gray-400">
                  Enter 0 or leave blank for any amount. User must{" "}
                  {isVendorBuy ? "spend" : "sell"} at least this amount to
                  complete the task.
                </p>
              </div>
            </>
          )}

          {isVendorLevelUp && (
            <div className="space-y-2">
              <Label htmlFor={`target-stage-${index}`} className="text-white">
                Target Stage
              </Label>
              <Select
                value={
                  typeof vendorConfig.target_stage === "number"
                    ? vendorConfig.target_stage.toString()
                    : "1"
                }
                onValueChange={(value) =>
                  updateTaskConfig({
                    target_stage: parseInt(value, 10),
                  })
                }
              >
                <SelectTrigger className="bg-transparent border-gray-700 text-gray-100">
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {getStageOptions().map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value.toString()}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-400">
                User must reach this vendor stage to complete the task.
              </p>
            </div>
          )}
        </div>
      )}

      {isDeployLock && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-800/50">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Network className="w-4 h-4" />
            Lock Deployment Config
          </h4>

          <p className="text-sm text-gray-400">
            Configure which networks users are allowed to deploy their locks on
            to complete this task. You can set{" "}
            <strong>Reward Multipliers</strong> for each network to incentivize
            deployment on specific chains. For example, a multiplier of 1.2 will
            give the user 20% more DG tokens for deploying on that network.
          </p>

          <div className="space-y-4">
            <Label className="text-white">Allowed Networks & Multipliers</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 8453, name: "Base Mainnet" },
                { id: 84532, name: "Base Sepolia" },
                { id: 10, name: "Optimism" },
                { id: 42161, name: "Arbitrum One" },
                { id: 42220, name: "Celo" },
              ].map((net) => {
                const networks = (vendorConfig.allowed_networks as any[]) || [];
                const netConfig = networks.find(
                  (n) => n.chain_id === net.id,
                ) || {
                  chain_id: net.id,
                  reward_ratio: 1.0,
                  enabled: false,
                };

                return (
                  <div
                    key={net.id}
                    className="flex flex-col p-3 rounded bg-gray-900 border border-gray-700 gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-200">
                        {net.name}
                      </span>
                      <input
                        type="checkbox"
                        checked={netConfig.enabled}
                        onChange={(e) => {
                          const newEnabled = e.target.checked;
                          let newNetworks = [...networks];
                          const idx = newNetworks.findIndex(
                            (n) => n.chain_id === net.id,
                          );

                          if (idx >= 0) {
                            newNetworks[idx] = {
                              ...netConfig,
                              enabled: newEnabled,
                            };
                          } else {
                            newNetworks.push({
                              ...netConfig,
                              enabled: newEnabled,
                            });
                          }
                          updateTaskConfig({ allowed_networks: newNetworks });
                        }}
                        className="rounded border-gray-700 bg-transparent text-flame-yellow focus:ring-flame-yellow"
                      />
                    </div>
                    {netConfig.enabled && (
                      <div className="flex items-center gap-2 mt-1">
                        <Label className="text-xs text-gray-400">
                          Reward Multiplier:
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="2.0"
                          value={netConfig.reward_ratio}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 1.0;
                            let newNetworks = [...networks];
                            const idx = newNetworks.findIndex(
                              (n) => n.chain_id === net.id,
                            );
                            if (idx >= 0) {
                              newNetworks[idx] = {
                                ...netConfig,
                                reward_ratio: val,
                              };
                              updateTaskConfig({
                                allowed_networks: newNetworks,
                              });
                            }
                          }}
                          className="h-7 text-xs bg-gray-800 border-gray-700"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

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

          {/* Admin Review Toggle */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <label
                  htmlFor={`admin-review-${index}`}
                  className="text-sm font-medium text-gray-300 cursor-pointer"
                >
                  Requires Admin Review
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  When enabled, submissions for this task will require manual
                  admin review and approval
                </p>
              </div>
              <div className="ml-4">
                <Toggle
                  checked={localTask.requires_admin_review || false}
                  onCheckedChange={(checked) =>
                    handleChange("requires_admin_review", checked)
                  }
                  ariaLabel="Requires Admin Review"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

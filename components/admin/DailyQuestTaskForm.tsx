import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Coins,
  Flame,
  Network,
  ArrowUpCircle,
  Repeat,
  CalendarCheck2,
  ArrowUp,
  ArrowDown,
  Trash2,
  GripVertical,
} from "lucide-react";
import { useDGMarket } from "@/hooks/vendor/useDGMarket";
import { getStageOptions } from "@/lib/blockchain/shared/vendor-constants";
import type { DailyQuestTask, TaskType } from "@/lib/supabase/types";

type TaskWithTempId = Partial<DailyQuestTask> & { tempId?: string };

const taskTypeOptions: {
  value: TaskType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
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
  {
    value: "uniswap_swap",
    label: "Uniswap Swap",
    icon: <Repeat className="w-4 h-4" />,
    description: "User must complete a Uniswap swap for a supported pair",
  },
  {
    value: "daily_checkin",
    label: "Daily Check-in",
    icon: <CalendarCheck2 className="w-4 h-4" />,
    description: "Verify the user has completed their daily GM check-in today",
  },
];

export function DailyQuestTaskForm(props: {
  task: TaskWithTempId;
  index: number;
  onUpdate: (t: TaskWithTempId) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const {
    task,
    index,
    onUpdate,
    onRemove,
    onMoveUp,
    onMoveDown,
    canMoveUp,
    canMoveDown,
  } = props;

  const [localTask, setLocalTask] = useState(task);
  const { minBuyAmount, minSellAmount } = useDGMarket();

  useEffect(() => {
    setLocalTask(task);
  }, [task]);

  const handleChange = (field: keyof DailyQuestTask, value: any) => {
    const updated = { ...localTask, [field]: value };
    setLocalTask(updated);
    onUpdate(updated);
  };

  const updateTaskConfig = (patch: Record<string, unknown>) => {
    const current =
      localTask.task_config && typeof localTask.task_config === "object"
        ? (localTask.task_config as Record<string, unknown>)
        : {};
    handleChange("task_config" as any, { ...current, ...patch });
  };

  const handleTaskTypeChange = (taskType: TaskType) => {
    const isDailyCheckin = taskType === "daily_checkin";
    const updated: TaskWithTempId = {
      ...localTask,
      task_type: taskType,
      input_required: false,
      requires_admin_review: false,
      verification_method: isDailyCheckin ? "automatic" : "blockchain",
      task_config: isDailyCheckin ? {} : (localTask.task_config ?? {}),
    };

    setLocalTask(updated);
    onUpdate(updated);
  };

  const type = localTask.task_type as TaskType | undefined;
  const isVendorBuy = type === "vendor_buy";
  const isVendorSell = type === "vendor_sell";
  const isVendorLightUp = type === "vendor_light_up";
  const isVendorLevelUp = type === "vendor_level_up";
  const isDeployLock = type === "deploy_lock";
  const isUniswapSwap = type === "uniswap_swap";
  const isDailyCheckin = type === "daily_checkin";

  const cfg =
    localTask.task_config && typeof localTask.task_config === "object"
      ? (localTask.task_config as Record<string, any>)
      : {};

  return (
    <div className="border border-gray-800 rounded-xl p-5 bg-gray-900/40 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-gray-300">
          <GripVertical className="w-4 h-4" />
          <span className="font-semibold">Task {index + 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMoveUp}
            disabled={!canMoveUp}
          >
            <ArrowUp className="w-4 h-4 mr-1" />
            Move Up
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onMoveDown}
            disabled={!canMoveDown}
          >
            <ArrowDown className="w-4 h-4 mr-1" />
            Move Down
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRemove}
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Remove
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-white">Task Type</Label>
          <Select
            value={(localTask.task_type as string) || ""}
            onValueChange={(value) => handleTaskTypeChange(value as TaskType)}
          >
            <SelectTrigger className="bg-transparent border-gray-700 text-gray-100">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {taskTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    {opt.icon}
                    <span>{opt.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {type ? (
            <p className="text-xs text-gray-400">
              {taskTypeOptions.find((o) => o.value === type)?.description || ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label className="text-white">Reward Amount (xDG)</Label>
          <Input
            type="number"
            min={0}
            step={1}
            value={
              typeof localTask.reward_amount === "number"
                ? localTask.reward_amount
                : 0
            }
            onChange={(e) =>
              handleChange("reward_amount" as any, Number(e.target.value || 0))
            }
            className="bg-transparent border-gray-700 text-gray-100"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-white">Title</Label>
        <Input
          value={localTask.title || ""}
          onChange={(e) => handleChange("title" as any, e.target.value)}
          className="bg-transparent border-gray-700 text-gray-100"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-white">Description</Label>
        <RichTextEditor
          value={localTask.description || ""}
          onChange={(content) => handleChange("description" as any, content)}
          placeholder="Describe what the user must do..."
        />
      </div>

      {(isVendorBuy || isVendorSell || isVendorLightUp || isVendorLevelUp) && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-800/50">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Coins className="w-4 h-4" />
            Vendor Task Config
          </h4>

          {(isVendorBuy || isVendorSell) && (
            <div className="space-y-2">
              <Label className="text-white">Minimum Amount (UP/DG)</Label>
              <Input
                type="text"
                value={
                  cfg.required_amount && typeof cfg.required_amount === "string"
                    ? (
                        BigInt(cfg.required_amount) / BigInt(10 ** 18)
                      ).toString() +
                      (BigInt(cfg.required_amount) % BigInt(10 ** 18) > 0
                        ? "." +
                          (BigInt(cfg.required_amount) % BigInt(10 ** 18))
                            .toString()
                            .padStart(18, "0")
                            .replace(/0+$/, "")
                        : "")
                    : ""
                }
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "" || value === "0") {
                    updateTaskConfig({
                      required_amount: "0",
                      required_token: isVendorSell ? "swap" : "base",
                    });
                  } else {
                    const [whole, decimal] = value.split(".");
                    const wholeBigInt = BigInt(whole || "0") * BigInt(10 ** 18);
                    const decimalBigInt = decimal
                      ? BigInt(decimal.padEnd(18, "0").slice(0, 18))
                      : BigInt(0);
                    const weiAmount = (wholeBigInt + decimalBigInt).toString();
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
                Enter 0 or leave blank for any amount.
              </p>
            </div>
          )}

          {isVendorLevelUp && (
            <div className="space-y-2">
              <Label className="text-white">Target Stage</Label>
              <Select
                value={
                  typeof cfg.target_stage === "number"
                    ? cfg.target_stage.toString()
                    : "1"
                }
                onValueChange={(value) =>
                  updateTaskConfig({ target_stage: parseInt(value, 10) })
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
                const networks = (cfg.allowed_networks as any[]) || [];
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
                            } else {
                              newNetworks.push({
                                ...netConfig,
                                reward_ratio: val,
                              });
                            }
                            updateTaskConfig({ allowed_networks: newNetworks });
                          }}
                          className="bg-transparent border-gray-700 text-gray-100"
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

      {isUniswapSwap && (
        <div className="border border-gray-700 rounded-lg p-4 space-y-4 bg-gray-800/50">
          <h4 className="font-semibold text-white flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            Uniswap Swap Config
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-white">Swap Pair</Label>
              <Select
                value={(cfg.pair as string) || ""}
                onValueChange={(value) => updateTaskConfig({ pair: value })}
              >
                <SelectTrigger className="bg-transparent border-gray-700 text-gray-100">
                  <SelectValue placeholder="Select pair" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ETH_UP">ETH / UP</SelectItem>
                  <SelectItem value="ETH_USDC">ETH / USDC</SelectItem>
                  <SelectItem value="UP_USDC">UP / USDC (multi-hop)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Direction</Label>
              <Select
                value={(cfg.direction as string) || ""}
                onValueChange={(value) =>
                  updateTaskConfig({ direction: value })
                }
              >
                <SelectTrigger className="bg-transparent border-gray-700 text-gray-100">
                  <SelectValue placeholder="Select direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A_TO_B">
                    {cfg.pair === "ETH_UP"
                      ? "ETH → UP"
                      : cfg.pair === "ETH_USDC"
                        ? "ETH → USDC"
                        : cfg.pair === "UP_USDC"
                          ? "UP → USDC"
                          : "A → B"}
                  </SelectItem>
                  <SelectItem value="B_TO_A">
                    {cfg.pair === "ETH_UP"
                      ? "UP → ETH"
                      : cfg.pair === "ETH_USDC"
                        ? "USDC → ETH"
                        : cfg.pair === "UP_USDC"
                          ? "USDC → UP"
                          : "B → A"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white">
              Minimum Input Amount (raw token units)
            </Label>
            <Input
              type="text"
              value={
                typeof cfg.required_amount_in === "string"
                  ? cfg.required_amount_in
                  : ""
              }
              onChange={(e) =>
                updateTaskConfig({ required_amount_in: e.target.value.trim() })
              }
              placeholder="e.g. 1000000000000000000 (1 ETH in wei)"
              className="bg-transparent border-gray-700 text-gray-100 font-mono"
            />
          </div>
        </div>
      )}

      {isDailyCheckin && (
        <div className="border border-gray-700 rounded-lg p-4 bg-gray-800/50">
          <div className="text-sm text-gray-300">
            This task verifies whether the user has already checked in today.
          </div>
        </div>
      )}
    </div>
  );
}

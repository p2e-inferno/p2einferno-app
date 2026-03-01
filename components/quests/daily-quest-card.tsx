import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { RichText } from "@/components/common/RichText";
import type { DailyQuestRunListItem } from "@/hooks/useDailyQuests";

function badgeLabelForFailure(failure: { type: string; message: string }) {
  switch (failure.type) {
    case "wallet_required":
      return "Wallet Required";
    case "vendor_stage": {
      const m = /^Requires\s+([A-Za-z0-9_-]+)\s+level/i.exec(
        failure.message || "",
      );
      const stage = m?.[1];
      return stage ? `${stage} Required` : "Vendor Level Required";
    }
    case "gooddollar_verification":
      return "GoodDollar Verification Required";
    case "lock_key":
      return "Key Required";
    case "erc20_balance":
      return "Token Balance Required";
    default:
      return "Requirement";
  }
}

export function DailyQuestCard(props: {
  run: DailyQuestRunListItem;
  authenticated: boolean;
  activeWalletAddress?: string | null;
  onStarted?: () => void;
}) {
  const { run, authenticated, activeWalletAddress, onStarted } = props;
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  const eligibility = run.eligibility;
  const isIneligible = Boolean(eligibility && eligibility.eligible === false);

  const startDisabled = starting || isIneligible;

  const handleStart = async () => {
    if (!authenticated) {
      toast.error("Please connect your wallet first");
      return;
    }
    if (!activeWalletAddress) {
      toast.error("Wallet not connected");
      return;
    }
    if (isIneligible) return;

    setStarting(true);
    try {
      const resp = await fetch(`/api/daily-quests/${run.id}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Active-Wallet": activeWalletAddress,
        },
        body: JSON.stringify({}),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          json?.message || json?.error || "Failed to start daily quest",
        );
      }
      if (onStarted) onStarted();
      await router.push(`/lobby/quests/daily/${run.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start daily quest",
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="group relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-xl p-6 border border-gray-700 hover:border-orange-500 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-orange-500/20">
      <Link href={`/lobby/quests/daily/${run.id}`} className="block">
        <div className="relative h-48 mb-6 rounded-lg overflow-hidden bg-gradient-to-br from-orange-900/20 to-red-900/20">
          <div className="w-full h-full flex items-center justify-center">
            <Image
              src={
                run.template?.image_url || "/images/quests/rosy-beginnings.svg"
              }
              alt={run.template?.title || "Daily Quest"}
              width={192}
              height={192}
              className="w-full h-full object-contain"
            />
          </div>

          <div className="absolute top-2 right-2 flex flex-col gap-2 items-end">
            {eligibility && eligibility.eligible === false
              ? (eligibility.failures || []).map((f) => (
                  <div
                    key={f.type}
                    className="bg-gray-800/80 backdrop-blur-sm border border-gray-600 text-gray-300 px-3 py-1 rounded-full text-sm font-semibold"
                  >
                    {badgeLabelForFailure(f)}
                  </div>
                ))
              : null}
          </div>
        </div>

        <h3 className="text-2xl font-bold text-white mb-2 group-hover:text-orange-400 transition-colors">
          {run.template?.title || "Daily Quest"}
        </h3>

        <RichText
          content={run.template?.description || ""}
          className="text-gray-400 mb-3 line-clamp-2"
        />

        <div className="text-sm text-gray-400 mb-2">
          Resets daily at 00:00 UTC
        </div>

        {run.completion_bonus_reward_amount > 0 && (
          <div className="text-sm text-cyan-300 mb-4">
            Completion Bonus: {run.completion_bonus_reward_amount} xDG
          </div>
        )}
      </Link>

      <div className="mt-2">
        <Button
          onClick={handleStart}
          disabled={startDisabled}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-75 disabled:cursor-not-allowed"
        >
          {starting ? "Starting..." : "Start"}
        </Button>
      </div>
    </div>
  );
}

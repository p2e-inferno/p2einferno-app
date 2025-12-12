/**
 * LevelUpCard Component
 *
 * Displays user stage progress and provides upgrade functionality.
 */

import { useDGProfile } from "@/hooks/vendor/useDGProfile";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, Zap, Star } from "lucide-react";

export default function LevelUpCard() {
    const { userState, upgradeStage, isPending } = useDGProfile();

    return (
        <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
                <ArrowUpCircle className="w-5 h-5 text-purple-500" />
                Stage Progress
            </h4>

            {/* Current Stage */}
            <div className="mb-4 text-center">
                <p className="text-gray-400 text-sm">Current Stage</p>
                <p className="text-4xl font-bold text-purple-400">
                    {userState?.stage ?? "Unknown"}
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-700 p-3 rounded">
                    <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                        <Star className="w-3 h-3" />
                        Points
                    </div>
                    <p className="text-lg font-semibold text-white">
                        {userState?.points?.toString() ?? "0"}
                    </p>
                </div>
                <div className="bg-gray-700 p-3 rounded">
                    <div className="flex items-center gap-1 text-gray-400 text-xs mb-1">
                        <Zap className="w-3 h-3" />
                        Fuel
                    </div>
                    <p className="text-lg font-semibold text-white">
                        {userState?.fuel?.toString() ?? "0"}
                    </p>
                </div>
            </div>

            {/* Progress Bar (simplified) */}
            <div className="mb-4">
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                        style={{
                            width: `${Math.min(
                                ((Number(userState?.points ?? 0n) % 1000) / 1000) * 100,
                                100
                            )}%`,
                        }}
                    />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-center">
                    Progress to next stage
                </p>
            </div>

            {/* Upgrade Button */}
            <Button
                onClick={() => upgradeStage()}
                disabled={isPending || !userState}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
                {isPending ? "Upgrading..." : "Upgrade Stage"}
            </Button>
        </div>
    );
}

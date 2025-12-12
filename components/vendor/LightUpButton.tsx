/**
 * LightUpButton Component
 *
 * Button to execute the Light Up action in the vendor contract.
 * Burns tokens to gain fuel and points.
 */

import { useDGLightUp } from "@/hooks/vendor/useDGLightUp";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";

export default function LightUpButton() {
    const { lightUp, isPending, isSuccess, hash } = useDGLightUp();

    return (
        <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="text-lg font-semibold mb-3 text-white flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                Light Up
            </h4>

            <p className="text-sm text-gray-400 mb-4">
                Burn DG tokens to gain fuel and points for stage progression.
            </p>

            <Button
                onClick={() => lightUp()}
                disabled={isPending}
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
            >
                {isPending ? (
                    <span className="flex items-center gap-2">
                        <span className="animate-spin">🔥</span>
                        Burning...
                    </span>
                ) : (
                    "Light Up 🔥"
                )}
            </Button>

            {isSuccess && hash && (
                <p className="mt-2 text-sm text-green-500">
                    Success! Tx: {hash.slice(0, 10)}...
                </p>
            )}
        </div>
    );
}

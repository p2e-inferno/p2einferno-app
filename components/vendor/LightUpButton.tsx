/**
 * LightUpButton Component
 *
 * Button to execute the Light Up action in the vendor contract.
 * Burns tokens to gain fuel and points.
 */

import { useDGLightUp } from "@/hooks/vendor/useDGLightUp";
import { Button } from "@/components/ui/button";
import { Flame } from "lucide-react";
import { useDGVendorAccess } from "@/hooks/vendor/useDGVendorAccess";

export default function LightUpButton() {
  const { lightUp, isPending, isApproving, isSuccess, hash } = useDGLightUp();
  const { isKeyHolder, isPaused } = useDGVendorAccess();

  const blockedReason = !isKeyHolder
    ? "Valid NFT key required to light up."
    : isPaused
      ? "Vendor is paused."
      : null;

  return (
    <div className="rounded-2xl border border-orange-500/40 bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-900/60 p-6 shadow-2xl shadow-black/40">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
        <Flame className="h-5 w-5 text-orange-400" />
        Light Up
      </h4>

      <p className="mb-4 text-xs text-slate-300">
        Burn DG tokens to gain fuel and points for stage progression.
      </p>

      <Button
        onClick={() => lightUp()}
        disabled={isPending || !!blockedReason}
        className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-red-500 font-semibold text-black hover:from-orange-600 hover:to-red-600"
      >
        {isApproving ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">🔥</span>
            Approving...
          </span>
        ) : isPending ? (
          <span className="flex items-center gap-2">
            <span className="animate-spin">🔥</span>
            Burning...
          </span>
        ) : (
          "Light Up 🔥"
        )}
      </Button>

      {isSuccess && hash && (
        <p className="mt-2 text-xs text-emerald-400">
          Success! Tx: {hash.slice(0, 10)}...
        </p>
      )}
      {blockedReason && (
        <p className="mt-2 text-xs text-red-400 text-center">{blockedReason}</p>
      )}
    </div>
  );
}

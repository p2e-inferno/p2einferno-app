import React from "react";
import Link from "next/link";
import { Shield, ArrowRight, Zap, CheckCircle2 } from "lucide-react";
import { useGoodDollarVerification } from "@/hooks/useGoodDollarVerification";
import { usePrivy } from "@privy-io/react-auth";
import { useFaceVerificationAction } from "@/components/gooddollar/FaceVerificationButton";

/**
 * VerificationBanner - A sleek CTA for the lobby to encourage GoodDollar verification
 */
export const VerificationBanner: React.FC = () => {
  const { authenticated, ready } = usePrivy();
  const { data: verification, isLoading } = useGoodDollarVerification();
  const {
    handleVerify,
    isLoading: isVerifying,
    isDisabled,
  } = useFaceVerificationAction();

  // Don't show if loading, not authenticated, or already verified
  if (
    !ready ||
    !authenticated ||
    isLoading ||
    (verification?.isWhitelisted && !verification?.needsReVerification)
  ) {
    return null;
  }

  return (
    <div
      id="gooddollar-verification"
      className="relative overflow-hidden group mb-8 scroll-mt-24"
    >
      {/* Background with gradient and patterns */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-blue-600/20 rounded-2xl border border-white/10 group-hover:border-blue-500/30 transition-colors duration-500" />
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none" />

      <div className="relative z-10 p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 text-center md:text-left">
          <div className="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 ring-4 ring-white/5">
            <Shield aria-hidden="true" className="w-8 h-8 text-white" />
          </div>

          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Zap aria-hidden="true" className="w-3 h-3" />
              Unlock Exclusive Features
            </div>
            <h3 className="text-xl md:text-2xl font-bold text-white mb-2">
              Become a Trusted Participant
            </h3>
            <p className="text-gray-400 text-sm md:text-base leading-relaxed">
              Verify your identity with GoodDollar to unlock exclusive
              high-reward quests and prove your uniqueness in the P2E INFERNO
              ecosystem.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 shrink-0">
          <button
            onClick={handleVerify}
            disabled={isDisabled}
            className="inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 bg-white text-black font-bold hover:bg-gray-100 transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl shadow-white/10"
          >
            {isVerifying ? "Starting..." : "Get Verified"}{" "}
            <ArrowRight aria-hidden="true" className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle2
                aria-hidden="true"
                className="w-3.5 h-3.5 text-blue-400"
              />
              1-Min Process
            </span>
            <Link
              href="/gooddollar/verification"
              className="text-blue-300 hover:text-blue-200 underline underline-offset-2 transition-colors"
            >
              Learn more
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

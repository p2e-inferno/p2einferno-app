import Link from "next/link";
import { Flame } from "lucide-react";
import { CompletionCallToActionProps } from "./types";

/**
 * CompletionCallToAction - Displays call-to-action when profile is incomplete
 */
export const CompletionCallToAction = ({
  completionPercentage,
}: CompletionCallToActionProps) => {
  if (completionPercentage >= 100) {
    return null;
  }

  return (
    <div className="mt-8 bg-gradient-to-r from-orange-900/30 to-red-900/30 rounded-xl p-5 sm:p-6 border border-orange-500/50 text-center">
      <Flame className="w-10 h-10 sm:w-12 sm:h-12 text-orange-500 mx-auto mb-4" />
      <h3 className="text-xl sm:text-2xl font-bold text-orange-400 mb-2">
        Complete Your Identity
      </h3>
      <p className="text-gray-300 mb-4">
        Link all your accounts to unlock the full power of the Infernal realm
        and earn rewards!
      </p>
      <Link
        href="/lobby/quests"
        className="inline-flex items-center bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2.5 sm:py-3 px-6 sm:px-8 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300"
      >
        View Quests
        <Flame className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
      </Link>
    </div>
  );
};

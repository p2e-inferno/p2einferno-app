import Link from "next/link";
import { CheckCircle2, LinkIcon, Unlink, Sparkles } from "lucide-react";
import { AccountCardProps } from "./types";

/**
 * AccountCard - Individual account linking card component
 */
export const AccountCard = ({
  account,
  isLinking,
  onLink,
  onUnlink,
}: AccountCardProps) => {
  return (
    <div
      className={`bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-6 border transition-all duration-300 ${
        account.linked
          ? "border-green-500/50"
          : "border-gray-700 hover:border-orange-500/50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center flex-1">
          {/* Account Icon */}
          <div
            className={`mr-4 p-3 rounded-lg ${
              account.linked
                ? "bg-green-500/20 text-green-500"
                : "bg-gray-800 text-gray-500"
            }`}
          >
            {account.icon}
          </div>

          {/* Account Info */}
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white mb-1 flex items-center">
              {account.name}
              {account.linked && (
                <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
              )}
            </h3>
            <p className="text-gray-400 text-sm mb-2">{account.description}</p>
            {account.linked && (
              <p className="text-gray-500 text-sm font-mono">
                {account.address || account.username || "Connected"}
              </p>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="ml-4">
          {account.linked ? (
            account.type !== "wallet" && (
              <button
                onClick={onUnlink}
                className="flex items-center text-red-400 hover:text-red-300 transition-colors"
              >
                <Unlink className="w-5 h-5 mr-1" />
                Unlink
              </button>
            )
          ) : (
            <button
              onClick={onLink}
              disabled={isLinking || account.type === "wallet"}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2 px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isLinking ? (
                <>Processing...</>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Link Account
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Quest Hint */}
      {!account.linked && account.type !== "wallet" && (
        <div className="mt-4 p-3 bg-orange-900/20 rounded-lg border border-orange-500/30">
          <p className="text-sm text-orange-400 flex items-center">
            <Sparkles className="w-4 h-4 mr-2" />
            Link this account in the{" "}
            <Link href="/lobby/quests" className="underline mx-1">
              Rosy Beginnings
            </Link>{" "}
            quest to earn 1000 DG!
          </p>
        </div>
      )}
    </div>
  );
};

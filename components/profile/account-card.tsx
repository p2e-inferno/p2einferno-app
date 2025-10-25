import Link from "next/link";
import { CheckCircle2, LinkIcon, Unlink, Sparkles } from "lucide-react";
import { AccountCardProps } from "./types";
import { formatWalletAddress } from "@/lib/utils/wallet-address";

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
      className={`bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-4 sm:p-6 border transition-all duration-300 ${
        account.linked
          ? "border-green-500/50"
          : "border-gray-700 hover:border-orange-500/50"
      }`}
    >
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-center flex-1 min-w-0">
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
          <div className="flex-1 min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1 flex items-center break-words">
              {account.name}
              {account.linked && (
                <CheckCircle2 className="w-5 h-5 text-green-500 ml-2" />
              )}
            </h3>
            <p className="text-gray-400 text-sm mb-2 break-words">
              {account.description}
            </p>
            {account.linked && (
              <p className="text-gray-500 text-sm font-mono min-w-0 break-words">
                {account.type === "wallet" ? (
                  <>
                    <span className="sm:hidden">
                      {formatWalletAddress(account.address || null)}
                    </span>
                    <span className="hidden sm:inline">
                      {account.address || "Connected"}
                    </span>
                  </>
                ) : (
                  account.address || account.username || "Connected"
                )}
              </p>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="sm:ml-4 self-stretch sm:self-auto text-center sm:text-right">
          {account.linked ? (
            account.type !== "wallet" && (
              <button
                onClick={onUnlink}
                className="inline-flex items-center text-red-400 hover:text-red-300 transition-colors"
              >
                <Unlink className="w-5 h-5 mr-1" />
                Unlink
              </button>
            )
          ) : (
            <button
              onClick={onLink}
              disabled={isLinking || account.type === "wallet"}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2 px-5 sm:px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
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
          <p className="text-sm text-orange-400 flex items-start">
            <Sparkles className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
            <span>
              Link this account in the{" "}
              <Link href="/lobby/quests" className="underline">
                Rosy Beginnings
              </Link>{" "}
              quest to earn 1000 DG!
            </span>
          </p>
        </div>
      )}
    </div>
  );
};

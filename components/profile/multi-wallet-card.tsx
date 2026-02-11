import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  LinkIcon,
  Unlink,
  Wallet,
  Circle,
  AlertCircle,
} from "lucide-react";
import { LinkedAccount } from "./types";
import { formatWalletAddress } from "@/lib/utils/wallet-address";

interface MultiWalletCardProps {
  wallets: LinkedAccount[];
  isLinking: boolean;
  onLink: () => void;
  onUnlink: (address: string) => void;
}

/**
 * MultiWalletCard - Displays multiple external wallets with a dropdown
 * Shows the active wallet prominently and allows viewing/unlinking other wallets
 */
export const MultiWalletCard = ({
  wallets,
  isLinking,
  onLink,
  onUnlink,
}: MultiWalletCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Find the active wallet (the one currently in use)
  const activeWallet = wallets.find((w) => w.isActive);
  const externalWallets = wallets.filter((w) => !w.isEmbedded);

  // If no active wallet found, use the first available one
  const displayWallet =
    activeWallet || wallets.find((w) => w.linked) || wallets[0];

  // Other wallets to show in dropdown
  const otherWallets = wallets.filter(
    (w) => w.address !== displayWallet?.address && w.linked,
  );

  return (
    <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-4 sm:p-6 border border-green-500/50 transition-all duration-300">
      {/* Main Wallet Display */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
        <div className="flex items-center flex-1 min-w-0">
          {/* Wallet Icon */}
          <div className="mr-4 p-3 rounded-lg bg-green-500/20 text-green-500">
            <Wallet className="w-6 h-6" />
          </div>

          {/* Wallet Info */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg sm:text-xl font-bold text-white mb-1 flex items-center flex-wrap gap-2">
              <span>
                {displayWallet?.isEmbedded ? "Embedded Wallet" : "Web3 Wallet"}
              </span>
              {displayWallet?.linked && (
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              )}
              {displayWallet?.isEmbedded && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-medium">
                  Embedded
                </span>
              )}
              {displayWallet?.isActive && !displayWallet?.isEmbedded && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                  In Use
                </span>
              )}
              {displayWallet?.isAvailable === false && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Not Available
                </span>
              )}
            </h3>
            <p className="text-gray-400 text-sm mb-2">
              {displayWallet?.isEmbedded
                ? "Managed by Privy — cannot be unlinked"
                : externalWallets.length > 1
                  ? `${externalWallets.length} external wallets linked`
                  : "Your gateway to the decentralized world"}
            </p>
            {displayWallet?.linked && displayWallet?.address && (
              <p className="text-gray-500 text-sm font-mono min-w-0 break-words">
                <span className="sm:hidden">
                  {formatWalletAddress(displayWallet.address)}
                </span>
                <span className="hidden sm:inline">
                  {displayWallet.address}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {!displayWallet?.isEmbedded && displayWallet?.address && (
            <button
              onClick={() => onUnlink(displayWallet.address!)}
              className="inline-flex items-center text-red-400 hover:text-red-300 transition-colors"
            >
              <Unlink className="w-5 h-5 mr-1" />
              Unlink
            </button>
          )}
          {displayWallet?.isEmbedded && (
            <button
              onClick={onLink}
              disabled={isLinking}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold py-2 px-5 sm:px-6 rounded-lg hover:from-orange-600 hover:to-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center"
            >
              {isLinking ? (
                <>Processing...</>
              ) : (
                <>
                  <LinkIcon className="w-4 h-4 mr-2" />
                  Link External Wallet
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Dropdown for other wallets */}
      {otherWallets.length > 0 && (
        <div className="mt-4 border-t border-gray-700 pt-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-between w-full text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-sm font-medium">
              {otherWallets.length} other wallet
              {otherWallets.length > 1 ? "s" : ""}
            </span>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {isExpanded && (
            <div className="mt-3 space-y-3">
              {otherWallets.map((wallet) => (
                <div
                  key={wallet.address}
                  className="bg-gray-800/50 rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Circle
                        className={`w-2 h-2 ${
                          wallet.isAvailable !== false
                            ? "fill-green-500 text-green-500"
                            : "fill-gray-500 text-gray-500"
                        }`}
                      />
                      <span className="text-sm font-mono text-gray-300 truncate">
                        <span className="sm:hidden">
                          {formatWalletAddress(wallet.address || null)}
                        </span>
                        <span className="hidden sm:inline">
                          {wallet.address || "Unknown"}
                        </span>
                      </span>
                      {wallet.isActive && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 font-medium">
                          In Use
                        </span>
                      )}
                      {wallet.isAvailable === false && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-medium">
                          Not Available
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {wallet.isEmbedded
                        ? "Embedded Wallet"
                        : "External Wallet"}
                    </p>
                  </div>
                  {!wallet.isEmbedded && wallet.address && (
                    <button
                      onClick={() => onUnlink(wallet.address!)}
                      className="text-red-400 hover:text-red-300 transition-colors text-sm flex items-center gap-1 flex-shrink-0"
                    >
                      <Unlink className="w-4 h-4" />
                      <span className="hidden sm:inline">Unlink</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Link New Wallet Button (always available) */}
      {!displayWallet?.isEmbedded && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={onLink}
            disabled={isLinking}
            className="w-full bg-gray-800 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
          >
            {isLinking ? (
              <>Processing...</>
            ) : (
              <>
                <LinkIcon className="w-4 h-4 mr-2" />
                Link Another Wallet
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

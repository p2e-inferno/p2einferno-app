import { LinkIcon } from "lucide-react";
import { LinkedAccountsProps } from "./types";
import { AccountCard } from "./account-card";
import { MultiWalletCard } from "./multi-wallet-card";

/**
 * LinkedAccountsSection - Manages the display and interaction of linked accounts
 * Handles special rendering for multiple external wallets
 */
export const LinkedAccountsSection = ({
  accounts,
  linking,
  onLinkAccount,
  onUnlinkAccount,
}: LinkedAccountsProps) => {
  // Separate wallet accounts from other accounts
  const walletAccounts = accounts.filter((acc) => acc.type === "wallet");
  const otherAccounts = accounts.filter((acc) => acc.type !== "wallet");

  // Count external wallets (non-embedded)
  const externalWallets = walletAccounts.filter(
    (acc) => acc.linked && !acc.isEmbedded
  );
  const hasMultipleExternalWallets = externalWallets.length > 1;

  // Find the primary wallet to display when not showing multi-wallet dropdown
  const primaryWallet = walletAccounts.find((acc) => acc.isActive) ||
                        walletAccounts.find((acc) => acc.linked) ||
                        walletAccounts[0];

  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center">
        <LinkIcon className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500 mr-2" />
        Linked Accounts
      </h2>

      {/* Render wallet accounts - use multi-wallet card if multiple external wallets */}
      {hasMultipleExternalWallets ? (
        <MultiWalletCard
          wallets={walletAccounts}
          isLinking={linking === "wallet"}
          onLink={() => onLinkAccount("wallet")}
          onUnlink={(address) => onUnlinkAccount("wallet", address)}
        />
      ) : (
        primaryWallet && (
          <AccountCard
            key={primaryWallet.address || primaryWallet.type}
            account={primaryWallet}
            isLinking={linking === "wallet"}
            onLink={() => onLinkAccount("wallet")}
            onUnlink={() =>
              onUnlinkAccount("wallet", primaryWallet.address || primaryWallet.username)
            }
          />
        )
      )}

      {/* Render other accounts normally */}
      {otherAccounts.map((account) => (
        <AccountCard
          key={account.address || account.username || account.type}
          account={account}
          isLinking={linking === account.type}
          onLink={() => onLinkAccount(account.type)}
          onUnlink={() =>
            onUnlinkAccount(account.type, account.address || account.username)
          }
        />
      ))}
    </div>
  );
};

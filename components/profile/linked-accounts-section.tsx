import { LinkIcon } from "lucide-react";
import { LinkedAccountsProps } from "./types";
import { AccountCard } from "./account-card";

/**
 * LinkedAccountsSection - Manages the display and interaction of linked accounts
 */
export const LinkedAccountsSection = ({
  accounts,
  linking,
  onLinkAccount,
  onUnlinkAccount,
}: LinkedAccountsProps) => {
  return (
    <div className="space-y-6">
      <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 flex items-center">
        <LinkIcon className="w-5 h-5 sm:w-6 sm:h-6 text-orange-500 mr-2" />
        Linked Accounts
      </h2>

      {accounts.map((account) => (
        <AccountCard
          key={account.type}
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

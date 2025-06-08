import { ReactNode } from "react";

export interface LinkedAccount {
  type: string;
  linked: boolean;
  address?: string;
  username?: string;
  icon: ReactNode;
  name: string;
  description: string;
}

export interface ProfileStats {
  questsCompleted: number;
  dgEarned: number;
  accountsLinked: number;
  totalAccounts: number;
}

export interface ProfileHeaderProps {
  userAddress?: string;
  completionPercentage: number;
  profileStats: ProfileStats;
}

export interface LinkedAccountsProps {
  accounts: LinkedAccount[];
  linking: string | null;
  onLinkAccount: (type: string) => Promise<void>;
  onUnlinkAccount: (type: string, address?: string) => Promise<void>;
}

export interface AccountCardProps {
  account: LinkedAccount;
  isLinking: boolean;
  onLink: () => Promise<void>;
  onUnlink: () => Promise<void>;
}

export interface CompletionCallToActionProps {
  completionPercentage: number;
}

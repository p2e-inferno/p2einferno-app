import { useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSignMessage } from "@privy-io/react-auth";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";

const log = getLogger("hooks:useTOSSigning");

export const useTOSSigning = () => {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const selectedWallet = useSmartWalletSelection();
  const { signMessage } = useSignMessage();

  const signTOS = useCallback(
    async (tosVersion: string = "1.0.0") => {
      const activeAddress = selectedWallet?.address || wallets?.[0]?.address;

      if (!user || !activeAddress) {
        toast.error("No wallet connected");
        return false;
      }

      try {
        const message = `I agree to the P2E INFERNO Terms of Service dated ${new Date().toISOString().split("T")[0]
          }. I understand that I am joining a decentralized educational community as an Infernal, Forged in Fire and Fueled by Rewards.`;

        const { signature } = await signMessage({ message });

        // Store signature via API
        const response = await fetch("/api/quests/sign-tos", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: user.id,
            walletAddress: activeAddress,
            signature,
            message,
            tosVersion,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to sign Terms of Service");
        }

        return signature;
      } catch (error) {
        log.error("Error signing TOS:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to sign Terms of Service",
        );
        return false;
      }
    },
    [user, wallets, signMessage],
  );

  const checkTOSSigned = useCallback(
    async (tosVersion: string = "1.0.0") => {
      if (!user) return false;

      try {
        const response = await fetch(
          `/api/quests/check-tos?userId=${user.id}&tosVersion=${tosVersion}`,
        );
        const data = await response.json();

        if (!response.ok) {
          return false;
        }

        return data.signed;
      } catch (error) {
        log.error("Error checking TOS status:", error);
        return false;
      }
    },
    [user],
  );

  return {
    signTOS,
    checkTOSSigned,
  };
};

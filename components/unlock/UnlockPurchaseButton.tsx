import { ButtonHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";

interface UnlockPurchaseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  lockAddress: string;
  networkId?: number; // default to env network
  children?: React.ReactNode;
}

/**
 * Wraps Unlock Protocol's checkout modal.
 * Requires the Unlock paywall script to be loaded (we inject in _app).
 */
export function UnlockPurchaseButton({
  lockAddress,
  networkId,
  children,
  ...props
}: UnlockPurchaseButtonProps) {
  const chain =
    networkId ?? Number(process.env.NEXT_PUBLIC_UNLOCK_NETWORK || 80001);

  const handleClick = () => {
    if (typeof window === "undefined") return;

    const unlockProtocol = (window as any).unlockProtocol || {};
    unlockProtocol.loadCheckoutModal({
      locks: {
        [lockAddress]: {
          network: chain,
        },
      },
      pessimistic: true,
    });
  };

  return (
    <Button onClick={handleClick} {...props}>
      {children || "Purchase Access"}
    </Button>
  );
}

import { useEffect, useState } from "react";
import { getUnlock } from "@/lib/unlock";
import { usePrivy } from "@privy-io/react-auth";

/**
 * Hook: useUnlockKey
 * Returns { hasKey, isLoading, error }
 */
export function useUnlockKey(lockAddress: string) {
  const { user } = usePrivy();
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [isLoading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function checkKey() {
      if (!user?.wallet?.address) {
        setLoading(false);
        setHasKey(false);
        return;
      }

      try {
        const unlock = getUnlock();
        const key = await unlock.getKeyByLockForOwner(
          lockAddress,
          user?.wallet?.address
        );
        setHasKey(!!key && key?.expiration > Date.now() / 1000);
      } catch (err) {
        console.error(err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    }

    checkKey();
  }, [user?.wallet?.address, lockAddress]);

  return { hasKey, isLoading, error } as const;
}

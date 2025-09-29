import { useState, useEffect } from "react";
import { mainnet } from "viem/chains";
import { createPublicClientUnified, createPublicClientForChain } from "@/lib/blockchain/config";
import { getEnsName } from "viem/ens";
import { getLogger } from '@/lib/utils/logger';

const log = getLogger('hooks:useENSResolution');


interface ENSResolutionResult {
  ensName: string | null;
  basename: string | null;
  displayName: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to resolve ENS names and basenames from wallet addresses
 * @param address - The wallet address to resolve
 * @returns Object containing resolved names, loading state, and error
 */
export const useENSResolution = (
  address: string | undefined
): ENSResolutionResult => {
  const [result, setResult] = useState<ENSResolutionResult>({
    ensName: null,
    basename: null,
    displayName: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (!address) {
      setResult((prev) => ({ ...prev, loading: false }));
      return;
    }

    const resolveNames = async () => {
      setResult((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Create public clients via unified transports
        const baseClient = createPublicClientUnified();
        const mainnetClient = createPublicClientForChain(mainnet);

        // Resolve ENS name on mainnet
        let ensName: string | null = null;
        try {
          ensName = await getEnsName(mainnetClient, {
            address: address as `0x${string}`,
          });
        } catch (err) {
          log.info("ENS resolution failed:", err);
        }

        // Resolve basename on Base network
        let basename: string | null = null;
        try {
          basename = await getEnsName(baseClient, {
            address: address as `0x${string}`,
          });
        } catch (err) {
          log.info("Basename resolution failed:", err);
        }

        // Determine display name priority: basename > ENS > null
        const displayName = basename || ensName || null;

        setResult({
          ensName,
          basename,
          displayName,
          loading: false,
          error: null,
        });
      } catch (error) {
        log.error("Name resolution error:", error);
        setResult((prev) => ({
          ...prev,
          loading: false,
          error:
            error instanceof Error ? error.message : "Failed to resolve names",
        }));
      }
    };

    resolveNames();
  }, [address]);

  return result;
};

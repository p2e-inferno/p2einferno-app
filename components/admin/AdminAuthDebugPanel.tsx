import { useState, useCallback, useMemo } from "react";
import {
  AdminAuthProvider,
  useAdminAuthContext,
  isFullyAuthenticated,
  getAuthStatusMessage,
} from "@/contexts/admin-context";
import { isCacheValid } from "@/contexts/admin-context/utils/adminAuthContextCacheUtils";
import { usePrivy } from "@privy-io/react-auth";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { PrivyConnectButton } from "@/components/PrivyConnectButton";
import {
  useUnlockWriteOperations,
  useUnlockAdminOperations,
} from "@/hooks/unlock";
import { useDeployLockEthers } from "@/hooks/unlock/useDeployLockEthers";
import { parseEther } from "viem";
import type { Address } from "viem";

const formatMillis = (value: number | null | undefined) => {
  if (!value) return "n/a";
  try {
    return new Date(value).toLocaleString();
  } catch (e) {
    return `${value}`;
  }
};

const formatSeconds = (value: number | null | undefined) => {
  if (!value) return "n/a";
  try {
    return new Date(value * 1000).toLocaleString();
  } catch (e) {
    return `${value}`;
  }
};

export function AdminAuthDebugPanel() {
  const {
    authStatus,
    isAdmin,
    authenticated,
    user,
    walletAddress,
    lastAuthCheck,
    cacheValidUntil,
    isLoadingAuth,
    isLoadingSession,
    hasValidSession,
    sessionExpiry,
    refreshAdminStatus,
    createAdminSession,
    refreshSession,
    clearSession,
    authError,
    sessionError,
    networkError,
    errorCount,
    lastErrorTime,
    retryAuth,
    retrySession,
    clearErrors,
    getHealthStatus,
  } = useAdminAuthContext();

  const connectedWallet = useSmartWalletSelection(); // Smart wallet selection

  const [sessionMessage, setSessionMessage] = useState("");
  const [apiMessage, setApiMessage] = useState("");

  const writeOps = useUnlockWriteOperations();
  const adminOps = useUnlockAdminOperations({ isAdmin: isAdmin });
  const ethersTestOps = useDeployLockEthers(); // Ethers test hook for debugging

  const [testParams, setTestParams] = useState({
    lockAddress: "",
    recipientAddress: "",
    lockName: "Test Lock",
    keyPrice: "0.01",
    expirationDuration: "365", // days
  });

  const handleRefreshAuth = useCallback(async () => {
    setSessionMessage("");
    await refreshAdminStatus();
  }, [refreshAdminStatus]);

  const handleCreateSession = useCallback(async () => {
    setSessionMessage("");
    setApiMessage("");
    try {
      const ok = await createAdminSession();
      setSessionMessage(ok ? "Session created" : "Session still invalid");
    } catch (err: any) {
      setSessionMessage(err?.message || "Session creation failed");
    }
  }, [createAdminSession]);

  const handleRefreshSession = useCallback(async () => {
    setSessionMessage("");
    setApiMessage("");
    const ok = await refreshSession();
    setSessionMessage(ok ? "Session refreshed" : "Session invalid");
  }, [refreshSession]);

  const handleRetrySession = useCallback(async () => {
    setSessionMessage("");
    setApiMessage("");
    try {
      const ok = await retrySession();
      setSessionMessage(ok ? "Session refreshed via retry" : "Session invalid");
    } catch (err: any) {
      setSessionMessage(err?.message || "Retry session failed");
    }
  }, [retrySession]);

  const handleClearSession = useCallback(() => {
    setSessionMessage("");
    setApiMessage("");
    clearSession();
  }, [clearSession]);

  const handleApiLogout = useCallback(async () => {
    setSessionMessage("");
    setApiMessage("");
    try {
      const resp = await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
      });
      if (resp.ok) {
        clearSession();
        setApiMessage("Admin session cookie cleared via API logout");
      } else {
        const data = await resp.json().catch(() => ({}));
        setApiMessage(
          data?.error || `Logout failed with status ${resp.status}`,
        );
      }
    } catch (error: any) {
      setApiMessage(error?.message || "Logout request failed");
    }
  }, [clearSession]);

  const statusMessage = getAuthStatusMessage(authStatus);
  const health = getHealthStatus();

  const cacheInsights = useMemo(() => {
    const isFresh = isCacheValid(cacheValidUntil);
    const ttlRemainingMs = cacheValidUntil
      ? Math.max(cacheValidUntil - Date.now(), 0)
      : 0;
    const ttlSeconds =
      ttlRemainingMs > 0 ? Math.ceil(ttlRemainingMs / 1000) : 0;

    return {
      isFresh,
      ttlSeconds,
      lastCheck: lastAuthCheck || null,
      expiresAt: cacheValidUntil || null,
    };
  }, [cacheValidUntil, lastAuthCheck]);

  return (
    <div className="space-y-4 rounded border border-dashed border-purple-500/60 bg-purple-950/10 p-4 text-sm">
      <PrivyDebugControls />

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-purple-100">
          Admin Auth Debug
        </h3>
        <span className="font-mono text-xs uppercase text-purple-300">
          {authStatus}
        </span>
      </div>

      <section className="grid gap-2">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <DebugStat label="Privy Auth" value={authenticated ? "yes" : "no"} />
          <DebugStat label="Wallet" value={walletAddress || "none"} mono />
          <DebugStat
            label="Blockchain Admin"
            value={isAdmin ? "granted" : "denied"}
          />
          <DebugStat
            label="Admin Session"
            value={hasValidSession ? "valid" : "missing"}
          />
          <DebugStat
            label="Session Expiry"
            value={formatSeconds(sessionExpiry)}
          />
          <DebugStat
            label="Cache Fresh"
            value={
              cacheInsights.isFresh
                ? `yes (${cacheInsights.ttlSeconds}s)`
                : "no"
            }
          />
          <DebugStat
            label="Auth Loading"
            value={isLoadingAuth ? "yes" : "no"}
          />
          <DebugStat
            label="Session Loading"
            value={isLoadingSession ? "yes" : "no"}
          />
          <DebugStat label="Errors" value={errorCount.toString()} />
          <DebugStat
            label="Network Error"
            value={networkError ? "yes" : "no"}
          />
          <DebugStat
            label="Fully Authenticated"
            value={isFullyAuthenticated(authStatus) ? "yes" : "no"}
          />
        </div>

        <div className="rounded bg-purple-950/20 p-2 font-mono text-xs text-purple-200">
          <p>Status: {statusMessage}</p>
          <p>
            Auth loading: {isLoadingAuth ? "yes" : "no"} | Session loading:{" "}
            {isLoadingSession ? "yes" : "no"}
          </p>
          {authError && <p className="text-red-300">Auth Error: {authError}</p>}
          {sessionError && (
            <p className="text-red-300">Session Error: {sessionError}</p>
          )}
          {sessionMessage && (
            <p className="text-blue-300">Action: {sessionMessage}</p>
          )}
          <p>Cache valid until: {formatMillis(cacheInsights.expiresAt)}</p>
          <p>Last auth check: {formatMillis(cacheInsights.lastCheck)}</p>
          <p>Last error: {formatMillis(lastErrorTime)}</p>
          <p>
            Health: {health.isHealthy ? "healthy" : "needs attention"} (
            {health.cacheStatus}/{health.sessionStatus})
          </p>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <DebugButton onClick={handleRefreshAuth} label="Refresh Auth" />
        <DebugButton onClick={retryAuth} label="Retry Auth (force)" />
        <DebugButton onClick={handleCreateSession} label="Create Session" />
        <DebugButton onClick={handleRefreshSession} label="Refresh Session" />
        <DebugButton onClick={handleRetrySession} label="Retry Session" />
        <DebugButton
          onClick={handleClearSession}
          label="Clear Session"
          variant="danger"
        />
        <DebugButton
          onClick={handleApiLogout}
          label="Logout (API)"
          variant="danger"
        />
        <DebugButton onClick={clearErrors} label="Clear Errors" />
      </section>

      {(sessionMessage || apiMessage) && (
        <div className="rounded bg-purple-900/30 p-2 text-xs text-purple-100">
          {sessionMessage && <p>Session action: {sessionMessage}</p>}
          {apiMessage && <p>API logout: {apiMessage}</p>}
        </div>
      )}

      <section className="space-y-4 rounded border border-dashed border-orange-500/60 bg-orange-950/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-orange-100">
            Unlock Operations Testing
          </h3>
          <span className="font-mono text-xs uppercase text-orange-300">
            {isAdmin ? "ADMIN" : "USER"}
          </span>
        </div>

        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <DebugStat
              label="Admin for Testing"
              value={isAdmin ? "yes" : "no"}
            />
            <DebugStat
              label="Key Purchase Loading"
              value={writeOps.keyPurchase.isLoading ? "yes" : "no"}
            />
            <DebugStat
              label="Deploy Lock Loading"
              value={writeOps.deployLock.isLoading ? "yes" : "no"}
            />
            <DebugStat
              label="Key Grant Loading"
              value={writeOps.keyGrant.isLoading ? "yes" : "no"}
            />
            <DebugStat
              label="Admin Deploy Loading"
              value={adminOps.deployAdminLock.isLoading ? "yes" : "no"}
            />
            <DebugStat
              label="Ethers Test Loading"
              value={ethersTestOps.isLoading ? "yes" : "no"}
            />
            <DebugStat
              label="Operation Success"
              value={
                writeOps.keyPurchase.isSuccess ||
                writeOps.deployLock.isSuccess ||
                writeOps.keyGrant.isSuccess ||
                adminOps.deployAdminLock.isSuccess ||
                ethersTestOps.isSuccess
                  ? "yes"
                  : "no"
              }
            />
          </div>

          <div className="rounded bg-orange-950/20 p-2 font-mono text-xs text-orange-200">
            {writeOps.keyPurchase.error && (
              <p className="text-red-300">
                Key Purchase Error: {writeOps.keyPurchase.error}
              </p>
            )}
            {writeOps.deployLock.error && (
              <p className="text-red-300">
                Deploy Lock Error: {writeOps.deployLock.error}
              </p>
            )}
            {writeOps.keyGrant.error && (
              <p className="text-red-300">
                Key Grant Error: {writeOps.keyGrant.error}
              </p>
            )}
            {adminOps.deployAdminLock.error && (
              <p className="text-red-300">
                Admin Deploy Error: {adminOps.deployAdminLock.error}
              </p>
            )}
            {ethersTestOps.error && (
              <p className="text-yellow-300">
                Ethers Test Error: {ethersTestOps.error}
              </p>
            )}
            {ethersTestOps.isSuccess && (
              <p className="text-green-300">
                ✅ Ethers Test: Deployment successful!
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs text-orange-300">Lock Address</label>
            <input
              type="text"
              value={testParams.lockAddress}
              onChange={(e) =>
                setTestParams((prev) => ({
                  ...prev,
                  lockAddress: e.target.value,
                }))
              }
              placeholder="0x..."
              className="w-full rounded bg-orange-950/30 px-2 py-1 text-xs text-orange-100 placeholder-orange-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-orange-300">Recipient Address</label>
            <input
              type="text"
              value={testParams.recipientAddress}
              onChange={(e) =>
                setTestParams((prev) => ({
                  ...prev,
                  recipientAddress: e.target.value,
                }))
              }
              placeholder="0x..."
              className="w-full rounded bg-orange-950/30 px-2 py-1 text-xs text-orange-100 placeholder-orange-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-orange-300">Lock Name</label>
            <input
              type="text"
              value={testParams.lockName}
              onChange={(e) =>
                setTestParams((prev) => ({ ...prev, lockName: e.target.value }))
              }
              placeholder="Test Lock"
              className="w-full rounded bg-orange-950/30 px-2 py-1 text-xs text-orange-100 placeholder-orange-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-orange-300">Key Price (ETH)</label>
            <input
              type="text"
              value={testParams.keyPrice}
              onChange={(e) =>
                setTestParams((prev) => ({ ...prev, keyPrice: e.target.value }))
              }
              placeholder="0.01"
              className="w-full rounded bg-orange-950/30 px-2 py-1 text-xs text-orange-100 placeholder-orange-400"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs text-orange-300">
              Expiration Duration (days)
            </label>
            <input
              type="text"
              value={testParams.expirationDuration}
              onChange={(e) =>
                setTestParams((prev) => ({
                  ...prev,
                  expirationDuration: e.target.value,
                }))
              }
              placeholder="365"
              className="w-full rounded bg-orange-950/30 px-2 py-1 text-xs text-orange-100 placeholder-orange-400"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <DebugButton
            onClick={async () => {
              if (!testParams.lockAddress) return;
              await writeOps.keyPurchase.purchaseKey({
                lockAddress: testParams.lockAddress as Address,
                recipient: (testParams.recipientAddress ||
                  connectedWallet?.address) as Address,
              });
            }}
            label="Purchase Key"
            variant="default"
          />
          <DebugButton
            onClick={async () => {
              await writeOps.deployLock.deployLock({
                name: testParams.lockName,
                expirationDuration: BigInt(
                  parseInt(testParams.expirationDuration) * 24 * 60 * 60,
                ),
                tokenAddress:
                  "0x0000000000000000000000000000000000000000" as Address, // ETH
                keyPrice: parseEther(testParams.keyPrice),
                maxNumberOfKeys: 1000n,
              });
            }}
            label="Deploy User Lock (Viem)"
            variant="default"
          />
          <DebugButton
            onClick={async () => {
              await ethersTestOps.deployLock({
                name: testParams.lockName + " (Ethers)",
                expirationDuration: BigInt(
                  parseInt(testParams.expirationDuration) * 24 * 60 * 60,
                ),
                tokenAddress:
                  "0x0000000000000000000000000000000000000000" as Address, // ETH
                keyPrice: parseEther(testParams.keyPrice),
                maxNumberOfKeys: 1000n,
              });
            }}
            label="Deploy User Lock (Ethers Test)"
            variant="default"
          />
          {isAdmin && (
            <DebugButton
              onClick={async () => {
                await adminOps.deployAdminLock.deployAdminLock({
                  name: testParams.lockName,
                  expirationDuration: BigInt(
                    parseInt(testParams.expirationDuration) * 24 * 60 * 60,
                  ),
                  tokenAddress:
                    "0x0000000000000000000000000000000000000000" as Address, // ETH
                  keyPrice: parseEther(testParams.keyPrice),
                  maxNumberOfKeys: 1000n,
                  isAdmin: true,
                });
              }}
              label="Deploy Admin Lock"
              variant="default"
            />
          )}
          <DebugButton
            onClick={async () => {
              if (!testParams.lockAddress || !testParams.recipientAddress)
                return;
              await writeOps.keyGrant.grantKey({
                lockAddress: testParams.lockAddress as Address,
                recipientAddress: testParams.recipientAddress as Address,
                keyManagers: [testParams.recipientAddress as Address],
              });
            }}
            label="Grant Key (Manager)"
            variant="default"
          />
        </div>
      </section>

      {user && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold uppercase text-purple-300">
            Privy User Snapshot
          </h4>
          <pre className="max-h-48 overflow-auto rounded bg-purple-950/30 p-2 font-mono text-[11px] text-purple-100">
            {JSON.stringify(
              {
                privyDid: user.id,
                privyWallet: user.wallet?.address,
                linkedAccounts: user.linkedAccounts?.map((acc: any) => ({
                  type: acc.type,
                  address: "address" in acc ? acc.address : undefined,
                })),
              },
              null,
              2,
            )}
          </pre>
        </div>
      )}
    </div>
  );
}

function DebugStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded bg-purple-950/25 p-2">
      <p className="text-xs text-purple-300">{label}</p>
      <p
        className={`text-sm font-semibold text-purple-50 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function DebugButton({
  onClick,
  label,
  variant = "default",
}: {
  onClick: () => void | Promise<void>;
  label: string;
  variant?: "default" | "danger";
}) {
  const color =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-500 focus-visible:ring-red-400"
      : "bg-purple-700 hover:bg-purple-600 focus-visible:ring-purple-400";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-semibold text-white transition focus-visible:outline-none focus-visible:ring ${color}`}
    >
      {label}
    </button>
  );
}

function PrivyDebugControls() {
  const { ready, authenticated, login, logout, user } = usePrivy();

  return (
    <div className="flex flex-col gap-3 rounded bg-purple-950/20 p-3 text-xs text-purple-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Privy Controls</p>
          <p className="text-[11px] text-purple-300">
            Ready: {ready ? "yes" : "no"} | Authenticated:{" "}
            {authenticated ? "yes" : "no"}
          </p>
          {user?.id && (
            <p className="text-[11px] text-purple-300">Privy DID: {user.id}</p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => login()}
            className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-600"
          >
            Privy Login
          </button>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-600"
          >
            Privy Logout
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-purple-300">Wallet menu:</span>
        <div className="rounded border border-purple-500/40 bg-purple-900/20 px-2 py-1">
          <PrivyConnectButton />
        </div>
      </div>
    </div>
  );
}

export function AdminAuthDebugProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}

export default AdminAuthDebugPanel;

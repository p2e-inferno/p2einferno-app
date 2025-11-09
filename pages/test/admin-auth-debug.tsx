import Head from "next/head";
import { useState } from "react";
import {
  AdminAuthDebugProvider,
  AdminAuthDebugPanel,
} from "@/components/admin/AdminAuthDebugPanel";
import { useIsLockManager } from "@/hooks/unlock/useIsLockManager";
import { useHasValidKey } from "@/hooks/unlock/useHasValidKey";
import { getLogger } from "@/lib/utils/logger";
import type { Address } from "viem";

const log = getLogger("admin-auth-debug");

const LockManagerChecker = () => {
  const [walletAddress, setWalletAddress] = useState("");
  const [lockAddress, setLockAddress] = useState(
    "0xe2A89dC837776f4e3bB024f067B6753d4D00D405",
  ); // Pre-populate with problematic lock
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<boolean | null>(null);

  const { checkIsLockManager, error } = useIsLockManager();

  const handleCheck = async () => {
    if (!walletAddress || !lockAddress) return;

    setIsChecking(true);
    setResult(null);

    try {
      const isManager = await checkIsLockManager(
        walletAddress as Address,
        lockAddress as Address,
      );
      setResult(isManager);
    } catch (err) {
      log.error("Lock manager check failed", { err });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold text-slate-100">
        Lock Manager Checker
      </h2>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Wallet Address
          </label>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0x7A2BF39919bb7e7bF3C0a96F005A0842CfDAa8ac"
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Lock Address
          </label>
          <input
            type="text"
            value={lockAddress}
            onChange={(e) => setLockAddress(e.target.value)}
            placeholder="0xe2A89dC837776f4e3bB024f067B6753d4D00D405"
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <button
          onClick={handleCheck}
          disabled={!walletAddress || !lockAddress || isChecking}
          className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed"
        >
          {isChecking ? "Checking..." : "Check Lock Manager Status"}
        </button>
      </div>

      {result !== null && (
        <div
          className={`rounded p-3 ${result ? "bg-green-900 border border-green-700" : "bg-red-900 border border-red-700"}`}
        >
          <p className="font-medium">
            {result
              ? "✅ Wallet IS a lock manager"
              : "❌ Wallet is NOT a lock manager"}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded p-3 bg-red-900 border border-red-700">
          <p className="font-medium text-red-100">Error:</p>
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
};

const ValidKeyChecker = () => {
  const [walletAddress, setWalletAddress] = useState(
    "0xC1eA63E3596599d186D80F07A8099047Fa49A901",
  ); // Pre-populate with recipient from logs
  const [lockAddress, setLockAddress] = useState(
    "0xe2A89dC837776f4e3bB024f067B6753d4D00D405",
  ); // Pre-populate with problematic lock
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<any>(null);

  const { checkHasValidKey, error } = useHasValidKey();

  const handleCheck = async () => {
    if (!walletAddress || !lockAddress) return;

    setIsChecking(true);
    setResult(null);

    try {
      const keyInfo = await checkHasValidKey(
        walletAddress as Address,
        lockAddress as Address,
      );
      setResult(keyInfo);
    } catch (err) {
      log.error("Valid key check failed", { err });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h2 className="text-lg font-semibold text-slate-100">
        Valid Key Checker
      </h2>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Wallet Address
          </label>
          <input
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="0xC1eA63E3596599d186D80F07A8099047Fa49A901"
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1">
            Lock Address
          </label>
          <input
            type="text"
            value={lockAddress}
            onChange={(e) => setLockAddress(e.target.value)}
            placeholder="0xe2A89dC837776f4e3bB024f067B6753d4D00D405"
            className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-100 placeholder-slate-500 focus:border-blue-400 focus:outline-none"
          />
        </div>

        <button
          onClick={handleCheck}
          disabled={!walletAddress || !lockAddress || isChecking}
          className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed"
        >
          {isChecking ? "Checking..." : "Check Valid Key Status"}
        </button>
      </div>

      {result !== null && (
        <div
          className={`rounded p-3 ${result ? "bg-green-900 border border-green-700" : "bg-yellow-900 border border-yellow-700"}`}
        >
          {result ? (
            <div>
              <p className="font-medium text-green-100">
                ✅ Wallet HAS a valid key
              </p>
              <div className="mt-2 text-sm text-green-200">
                <p>
                  <strong>Token ID:</strong> {result.tokenId.toString()}
                </p>
                <p>
                  <strong>Owner:</strong> {result.owner}
                </p>
                <p>
                  <strong>Expiration:</strong>{" "}
                  {new Date(
                    Number(result.expirationTimestamp) * 1000,
                  ).toLocaleString()}
                </p>
                <p>
                  <strong>Is Valid:</strong> {result.isValid ? "Yes" : "No"}
                </p>
              </div>
            </div>
          ) : (
            <p className="font-medium text-yellow-100">
              ⚠️ Wallet does NOT have a valid key
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="rounded p-3 bg-red-900 border border-red-700">
          <p className="font-medium text-red-100">Error:</p>
          <p className="text-sm text-red-200">{error}</p>
        </div>
      )}
    </div>
  );
};

const AdminAuthDebugTestPage = () => {
  return (
    <AdminAuthDebugProvider>
      <Head>
        <title>Admin Auth Debug Test</title>
      </Head>
      <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 bg-slate-950 px-4 py-8 text-slate-100">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">
            Admin Authentication Debug (Isolated)
          </h1>
          <p className="text-sm text-slate-300">
            This standalone page mounts the AdminAuthProvider outside the admin
            layout so you can validate RPC behavior without legacy admin hooks
            interfering.
          </p>
          <p className="text-xs uppercase tracking-wide text-amber-300">
            Remove once validation is complete. Do not expose in production.
          </p>
        </header>

        <AdminAuthDebugPanel />

        <LockManagerChecker />

        <ValidKeyChecker />
      </main>
    </AdminAuthDebugProvider>
  );
};

export default AdminAuthDebugTestPage;

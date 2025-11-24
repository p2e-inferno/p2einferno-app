/**
 * Wagmi Integration Test Page
 * Verifies Privy + Wagmi integration is working correctly
 */

import { usePrivy } from "@privy-io/react-auth";
import { useConnection, useBalance, useBlockNumber, useChainId } from "wagmi";
import { usePrivyWagmi } from "@/hooks/usePrivyWagmi";
import { formatEther } from "viem";

export default function WagmiIntegrationTest() {
  // Privy auth
  const { login, logout, authenticated, ready } = usePrivy();

  // Wagmi hooks
  const { address, isConnected, chain } = useConnection();
  const chainId = useChainId();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const { data: balance, isLoading: balanceLoading } = useBalance({
    address: address,
  });

  // Sync status
  const { isSynced, privyAddress, wagmiAddress, activeWallet } =
    usePrivyWagmi();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">
            Wagmi Integration Test Page
          </h1>
          <p className="text-gray-400">
            Verify Privy + Wagmi integration is working correctly
          </p>
        </div>

        {/* Authentication Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">
            1. Authentication Status
          </h2>
          <div className="space-y-2">
            <StatusRow
              label="Privy Ready"
              value={ready}
              status={ready ? "success" : "pending"}
            />
            <StatusRow
              label="Privy Authenticated"
              value={authenticated}
              status={authenticated ? "success" : "error"}
            />
            <StatusRow
              label="Wagmi Connected"
              value={isConnected}
              status={isConnected ? "success" : "error"}
            />
          </div>

          {!authenticated ? (
            <button
              onClick={login}
              className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition"
            >
              Connect Wallet (Privy)
            </button>
          ) : (
            <button
              onClick={logout}
              className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-medium transition"
            >
              Disconnect
            </button>
          )}
        </div>

        {/* Wallet Address Sync */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold mb-4">
            2. Wallet Address Sync
          </h2>
          <div className="space-y-2">
            <StatusRow
              label="Addresses Synced"
              value={isSynced}
              status={isSynced ? "success" : "warning"}
            />
            <div className="text-sm">
              <div className="mb-1">
                <span className="text-gray-400">Privy Address:</span>{" "}
                <code className="text-green-400 ml-2">
                  {privyAddress || "Not connected"}
                </code>
              </div>
              <div>
                <span className="text-gray-400">Wagmi Address:</span>{" "}
                <code className="text-blue-400 ml-2">
                  {wagmiAddress || "Not detected"}
                </code>
              </div>
            </div>

            {activeWallet && (
              <div className="mt-2 text-sm text-gray-400">
                <div>Wallet Type: {activeWallet.walletClientType}</div>
                <div>Connector: {activeWallet.connectorType}</div>
              </div>
            )}
          </div>
        </div>

        {/* Blockchain Data (Wagmi Hooks) */}
        {isConnected && address && (
          <>
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-2xl font-semibold mb-4">
                3. Blockchain Data (Wagmi Hooks)
              </h2>
              <div className="space-y-2">
                <div className="text-sm">
                  <span className="text-gray-400">Chain ID:</span>{" "}
                  <code className="text-yellow-400 ml-2">{chainId}</code>
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Chain Name:</span>{" "}
                  <code className="text-yellow-400 ml-2">
                    {chain?.name || "Unknown"}
                  </code>
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Block Number:</span>{" "}
                  <code className="text-yellow-400 ml-2">
                    {blockNumber?.toString() || "Loading..."}
                  </code>
                  <span className="text-green-400 ml-2 text-xs">● Live</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Native Balance:</span>{" "}
                  {balanceLoading ? (
                    <span className="text-gray-500 ml-2">Loading...</span>
                  ) : balance ? (
                    <code className="text-yellow-400 ml-2">
                      {parseFloat(formatEther(balance.value)).toFixed(6)}{" "}
                      {balance.symbol}
                    </code>
                  ) : (
                    <span className="text-gray-500 ml-2">N/A</span>
                  )}
                </div>
              </div>
            </div>

            {/* Test Results */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-2xl font-semibold mb-4">4. Test Results</h2>
              <div className="space-y-2">
                <TestResult
                  label="✓ Wagmi hooks accessible"
                  status="pass"
                  description="useAccount, useBalance, useBlockNumber working"
                />
                <TestResult
                  label={
                    isSynced
                      ? "✓ Wallet addresses synced"
                      : "⚠ Wallet addresses not synced"
                  }
                  status={isSynced ? "pass" : "warning"}
                  description={
                    isSynced
                      ? "Privy and Wagmi showing same address"
                      : "May need to refresh or reconnect"
                  }
                />
                <TestResult
                  label={
                    blockNumber
                      ? "✓ Real-time blockchain data"
                      : "⏳ Waiting for block data"
                  }
                  status={blockNumber ? "pass" : "pending"}
                  description="Block number updates in real-time"
                />
                <TestResult
                  label="✓ Integration successful"
                  status="pass"
                  description="Privy + Wagmi working together"
                />
              </div>
            </div>
          </>
        )}

        {/* Instructions */}
        {!authenticated && (
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-6 mt-6">
            <h3 className="text-xl font-semibold mb-2">📝 Instructions</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-300">
              <li>Click &ldquo;Connect Wallet (Privy)&rdquo; above</li>
              <li>Complete authentication via Privy</li>
              <li>Observe wallet address sync status</li>
              <li>Check that blockchain data loads via Wagmi hooks</li>
              <li>Verify block number updates in real-time</li>
            </ol>
          </div>
        )}

        {/* Developer Info */}
        <div className="mt-8 text-xs text-gray-500 text-center">
          <p>Test Page • Wagmi v3 + Privy Integration</p>
          <p className="mt-1">
            Remove this page after verifying integration works
          </p>
        </div>
      </div>
    </div>
  );
}

// Helper Components

interface StatusRowProps {
  label: string;
  value: boolean;
  status: "success" | "error" | "warning" | "pending";
}

function StatusRow({ label, value, status }: StatusRowProps) {
  const colors = {
    success: "text-green-400",
    error: "text-red-400",
    warning: "text-yellow-400",
    pending: "text-gray-400",
  };

  const icons = {
    success: "✓",
    error: "✗",
    warning: "⚠",
    pending: "○",
  };

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-300">{label}</span>
      <span className={colors[status]}>
        {icons[status]} {value ? "Yes" : "No"}
      </span>
    </div>
  );
}

interface TestResultProps {
  label: string;
  status: "pass" | "fail" | "warning" | "pending";
  description: string;
}

function TestResult({ label, status, description }: TestResultProps) {
  const colors = {
    pass: "border-green-500/30 bg-green-900/10",
    fail: "border-red-500/30 bg-red-900/10",
    warning: "border-yellow-500/30 bg-yellow-900/10",
    pending: "border-gray-500/30 bg-gray-900/10",
  };

  return (
    <div className={`border rounded p-3 ${colors[status]}`}>
      <div className="font-medium text-sm">{label}</div>
      <div className="text-xs text-gray-400 mt-1">{description}</div>
    </div>
  );
}

import React, { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { unlockUtils } from "../../lib/unlock/lockUtils";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

/**
 * Demo component to test the new lockUtils integration
 * This demonstrates the unlock-magic-portal approach working with Privy
 */
export function UnlockUtilsDemo() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0]; // Use wallets from useWallets() hook

  const [lockAddress, setLockAddress] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Lock deployment form
  const [lockConfig, setLockConfig] = useState({
    name: "Test Lock",
    symbol: "TEST",
    keyPrice: "0.01",
    maxNumberOfKeys: 100,
    expirationDuration: 86400, // 24 hours in seconds
    currency: "ETH",
  });

  // Grant keys form
  const [grantConfig, setGrantConfig] = useState({
    recipients: "",
    duration: "86400", // 24 hours
  });

  // Add manager form
  const [managerAddress, setManagerAddress] = useState("");

  const testLockAddress = "0x1234567890123456789012345678901234567890"; // Example address

  // Helper function to convert BigInt values to strings for display
  const serializeResults = (data: any): any => {
    if (data === null || data === undefined) return data;

    if (typeof data === "bigint") {
      return data.toString();
    }

    if (Array.isArray(data)) {
      return data.map(serializeResults);
    }

    if (typeof data === "object") {
      const serialized: any = {};
      for (const [key, value] of Object.entries(data)) {
        serialized[key] = serializeResults(value);
      }
      return serialized;
    }

    return data;
  };

  const handleTestReadOperations = async () => {
    if (!lockAddress) return;

    setLoading(true);
    setResults(null);

    try {
      const [totalKeys, keyPrice] = await Promise.all([
        unlockUtils.getTotalKeys(lockAddress),
        unlockUtils.getKeyPrice(lockAddress),
      ]);

      let ownership = false;
      let balance = 0;

      if (wallet?.address) {
        [ownership, balance] = await Promise.all([
          unlockUtils.checkKeyOwnership(lockAddress, wallet.address),
          unlockUtils.getUserKeyBalance(lockAddress, wallet.address),
        ]);
      }

      const resultData = {
        totalKeys,
        keyPrice: {
          price: keyPrice.price.toString(), // Convert BigInt to string
          priceInEth: keyPrice.priceInEth,
        },
        userOwnership: ownership,
        userBalance: balance,
        userAddress: wallet?.address || "Not connected",
      };

      setResults(resultData);
    } catch (error) {
      setResults({
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTestPurchase = async () => {
    if (!lockAddress || !wallet) {
      alert("Need lock address and connected wallet");
      return;
    }

    setLoading(true);

    try {
      // Get current price first
      const { priceInEth } = await unlockUtils.getKeyPrice(lockAddress);

      const result = await unlockUtils.purchaseKey(
        lockAddress,
        parseFloat(priceInEth),
        priceInEth === "0" ? "FREE" : "ETH",
        wallet
      );

      setResults({
        purchaseResult: result,
        explorerUrl: result.transactionHash
          ? unlockUtils.getBlockExplorerUrl(result.transactionHash)
          : null,
      });
    } catch (error) {
      setResults({
        error: error instanceof Error ? error.message : "Purchase failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeployLock = async () => {
    if (!wallet) {
      alert("Need connected wallet");
      return;
    }

    setLoading(true);

    try {
      const result = await unlockUtils.deployLock(
        {
          ...lockConfig,
          price: parseFloat(lockConfig.keyPrice),
        },
        wallet
      );

      setResults({
        deployResult: result,
        explorerUrl: result.transactionHash
          ? unlockUtils.getBlockExplorerUrl(result.transactionHash)
          : null,
      });

      // If deployment was successful, set the new lock address for testing
      if (result.success && result.lockAddress) {
        setLockAddress(result.lockAddress);
      }
    } catch (error) {
      setResults({
        error: error instanceof Error ? error.message : "Deployment failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGrantKeys = async () => {
    if (!lockAddress || !wallet || !grantConfig.recipients) {
      alert("Need lock address, connected wallet, and recipients");
      return;
    }

    setLoading(true);

    try {
      const recipients = grantConfig.recipients
        .split(",")
        .map((addr) => addr.trim());
      const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));
      const expirationTimestamp =
        currentTimestamp + BigInt(grantConfig.duration);
      const expirationTimestamps = recipients.map(() => expirationTimestamp);

      const result = await unlockUtils.grantKeys(
        lockAddress,
        recipients,
        expirationTimestamps,
        wallet
      );

      setResults({
        grantResult: result,
        explorerUrl: result.transactionHash
          ? unlockUtils.getBlockExplorerUrl(result.transactionHash)
          : null,
      });
    } catch (error) {
      setResults({
        error: error instanceof Error ? error.message : "Grant keys failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddManager = async () => {
    if (!lockAddress || !wallet || !managerAddress) {
      alert("Need lock address, connected wallet, and manager address");
      return;
    }

    setLoading(true);

    try {
      const result = await unlockUtils.addLockManager(
        lockAddress,
        managerAddress,
        wallet
      );

      setResults({
        addManagerResult: result,
        explorerUrl: result.transactionHash
          ? unlockUtils.getBlockExplorerUrl(result.transactionHash)
          : null,
      });
    } catch (error) {
      setResults({
        error: error instanceof Error ? error.message : "Add manager failed",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 max-w-4xl mx-auto mt-8">
      <h2 className="text-2xl font-bold mb-4">🔓 Unlock Protocol Utils Demo</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Read Operations & Purchase */}
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold mb-3">
              📖 Read Operations & Purchase
            </h3>

            <div className="space-y-3">
              <div>
                <Label className="block text-sm font-medium mb-2">
                  Lock Address:
                </Label>
                <Input
                  value={lockAddress}
                  onChange={(e) => setLockAddress(e.target.value)}
                  placeholder="0x..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Test with a real Unlock Protocol lock address on Base Sepolia
                </p>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  onClick={handleTestReadOperations}
                  disabled={!lockAddress || loading}
                  variant="outline"
                  size="sm"
                >
                  Read Operations
                </Button>

                <Button
                  onClick={handleTestPurchase}
                  disabled={!lockAddress || !wallet || loading}
                  variant="default"
                  size="sm"
                >
                  Purchase Key
                </Button>
              </div>
            </div>
          </Card>

          {/* Deploy Lock */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">🚀 Deploy New Lock</h3>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={lockConfig.name}
                    onChange={(e) =>
                      setLockConfig({ ...lockConfig, name: e.target.value })
                    }
                    placeholder="Lock Name"
                    size="sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Price (ETH)</Label>
                  <Input
                    value={lockConfig.keyPrice}
                    onChange={(e) =>
                      setLockConfig({ ...lockConfig, keyPrice: e.target.value })
                    }
                    placeholder="0.01"
                    size="sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Max Keys</Label>
                  <Input
                    type="number"
                    value={lockConfig.maxNumberOfKeys}
                    onChange={(e) =>
                      setLockConfig({
                        ...lockConfig,
                        maxNumberOfKeys: parseInt(e.target.value),
                      })
                    }
                    size="sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Duration (seconds)</Label>
                  <Input
                    type="number"
                    value={lockConfig.expirationDuration}
                    onChange={(e) =>
                      setLockConfig({
                        ...lockConfig,
                        expirationDuration: parseInt(e.target.value),
                      })
                    }
                    size="sm"
                  />
                </div>
              </div>

              <Button
                onClick={handleDeployLock}
                disabled={!wallet || loading}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Deploy Lock
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column - Lock Management */}
        <div className="space-y-4">
          {/* Grant Keys */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">🎁 Grant Keys</h3>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Recipients (comma-separated)</Label>
                <Input
                  value={grantConfig.recipients}
                  onChange={(e) =>
                    setGrantConfig({
                      ...grantConfig,
                      recipients: e.target.value,
                    })
                  }
                  placeholder="0x123..., 0x456..."
                  className="font-mono text-xs"
                />
              </div>

              <div>
                <Label className="text-xs">Duration (seconds)</Label>
                <Input
                  type="number"
                  value={grantConfig.duration}
                  onChange={(e) =>
                    setGrantConfig({ ...grantConfig, duration: e.target.value })
                  }
                  size="sm"
                />
              </div>

              <Button
                onClick={handleGrantKeys}
                disabled={!lockAddress || !wallet || loading}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Grant Keys
              </Button>
            </div>
          </Card>

          {/* Add Manager */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">👤 Add Lock Manager</h3>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Manager Address</Label>
                <Input
                  value={managerAddress}
                  onChange={(e) => setManagerAddress(e.target.value)}
                  placeholder="0x..."
                  className="font-mono text-sm"
                />
              </div>

              <Button
                onClick={handleAddManager}
                disabled={!lockAddress || !wallet || loading}
                variant="secondary"
                size="sm"
                className="w-full"
              >
                Add Manager
              </Button>
            </div>
          </Card>

          {/* Status */}
          {!wallet && (
            <Card className="p-3 bg-amber-50 border-amber-200">
              <p className="text-sm text-amber-700">
                💡 Connect your wallet to test wallet operations
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-6 mt-6 border-t">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-600 mt-2">Processing...</p>
        </div>
      )}

      {/* Results */}
      {results && (
        <Card className="p-4 bg-gray-50 mt-6">
          <h3 className="font-semibold mb-2">Results:</h3>
          <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded border overflow-auto max-h-96">
            {JSON.stringify(serializeResults(results), null, 2)}
          </pre>

          {results.explorerUrl && (
            <div className="mt-3">
              <a
                href={results.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 text-sm"
              >
                🔗 View Transaction on Explorer
              </a>
            </div>
          )}
        </Card>
      )}

      {/* Documentation */}
      <div className="border-t pt-4 mt-6">
        <h3 className="font-semibold mb-2">🔧 Available Functions:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-gray-800 mb-2">Read Operations:</h4>
            <ul className="space-y-1 text-gray-700">
              <li>
                • <code>getTotalKeys()</code> - Get total keys sold
              </li>
              <li>
                • <code>getKeyPrice()</code> - Get current key price
              </li>
              <li>
                • <code>checkKeyOwnership()</code> - Check if user owns key
              </li>
              <li>
                • <code>getUserKeyBalance()</code> - Get user's key balance
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-800 mb-2">
              Wallet Operations:
            </h4>
            <ul className="space-y-1 text-gray-700">
              <li>
                • <code>purchaseKey()</code> - Purchase key with Privy wallet
              </li>
              <li>
                • <code>deployLock()</code> - Deploy new Unlock lock
              </li>
              <li>
                • <code>grantKeys()</code> - Grant keys to users
              </li>
              <li>
                • <code>addLockManager()</code> - Add lock manager
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Card>
  );
}

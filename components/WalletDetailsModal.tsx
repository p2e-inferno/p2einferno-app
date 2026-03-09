import React, { useMemo, useState, useEffect } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWalletBalances } from "@/hooks/useWalletBalances";
import { CURRENT_NETWORK } from "@/lib/blockchain/legacy/frontend-config";
import { getWalletTransferTokenAddresses } from "@/lib/wallet/tokenAddresses";
import {
  Copy,
  ExternalLink,
  RefreshCcw,
  Wallet,
  Download,
  Plus,
  X,
} from "lucide-react";
import { useAddDGTokenToWallet } from "@/hooks/useAddDGTokenToWallet";
import { copyToClipboard } from "@/lib/utils/clipboard";
import { useWalletTransfer } from "@/hooks/useWalletTransfer";
import { useDebounce } from "@/hooks/useDebounce";
import toast from "react-hot-toast";
import {
  showDismissibleError,
  showTransactionSuccess,
} from "@/components/ui/dismissible-toast";
import { formatUnits, isAddress, parseUnits } from "viem";
import { mainnet } from "viem/chains";
import { createPublicClientForChain } from "@/lib/blockchain/config";
import { formatWalletError } from "@/lib/utils/walletErrors";
import { Loader2 } from "lucide-react";

interface WalletDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
}

// Simple QR Code generator using a service (you can replace with a library if preferred)
const QRCodeDisplay: React.FC<{ address: string; size?: number }> = ({
  address,
  size = 140,
}) => {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${address}&format=png&bgcolor=1a1b23&color=f97316&qzone=2`;

  return (
    <div className="flex flex-col items-center space-y-3">
      <div className="bg-white p-3 sm:p-4 rounded-lg">
        <Image
          src={qrUrl}
          alt="Wallet Address QR Code"
          width={size}
          height={size}
          className="rounded max-w-full h-auto"
        />
      </div>
      <p className="text-xs text-gray-400 text-center max-w-xs px-2">
        Scan this QR code to copy the wallet address
      </p>
    </div>
  );
};

export const WalletDetailsModal: React.FC<WalletDetailsModalProps> = ({
  isOpen,
  onClose,
  walletAddress,
}) => {
  const [recipient, setRecipient] = useState("");
  const [selectedToken, setSelectedToken] = useState("");
  const [amount, setAmount] = useState("");

  const { balances, loading, error, refreshBalances, networkName } =
    useWalletBalances({ enabled: isOpen });
  const { transferNative, transferErc20, isTransferring } = useWalletTransfer();

  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionAttempted, setResolutionAttempted] = useState(false);
  const debouncedRecipient = useDebounce(recipient.trim(), 1000);

  // Reset resolution state when recipient changes (raw input)
  useEffect(() => {
    setResolutionAttempted(false);
    setResolvedAddress(null);
    if (!recipient.trim()) {
      setIsResolving(false);
    }
  }, [recipient]);

  // ENS Resolution Effect
  useEffect(() => {
    let aborted = false;
    const captured = debouncedRecipient.trim().toLowerCase();

    const resolve = async () => {
      // Only attempt resolution if it looks like a name (contains dot) and isn't already an address
      if (!captured.includes(".") || isAddress(captured)) {
        if (!aborted) {
          setResolvedAddress(null);
          setIsResolving(false);
          setResolutionAttempted(true);
        }
        return;
      }

      setIsResolving(true);
      try {
        const client = createPublicClientForChain(mainnet);
        const addr = await client.getEnsAddress({ name: captured });

        if (!aborted) {
          setResolvedAddress(addr || null);
          setResolutionAttempted(true);
        }
      } catch (err) {
        if (!aborted) {
          setResolvedAddress(null);
          setResolutionAttempted(true);
        }
      } finally {
        if (!aborted) {
          setIsResolving(false);
        }
      }
    };

    resolve();

    return () => {
      aborted = true;
    };
  }, [debouncedRecipient]);

  const {
    addToken: addDGToken,
    isAvailable: isAddAvailable,
    isLoading: isAddLoading,
  } = useAddDGTokenToWallet();

  const shortAddress = `${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 6)}`;
  const explorerBaseUrl = CURRENT_NETWORK.explorerUrl;

  const transferTokens = useMemo(() => {
    const tokenAddresses = getWalletTransferTokenAddresses();

    const tokens = [
      {
        key: "eth",
        symbol: "ETH",
        decimals: 18,
        isNative: true,
        address: null as `0x${string}` | null,
        rawBalance: balances.eth.balance,
        formattedBalance: balances.eth.formatted,
      },
      {
        key: "usdc",
        symbol: balances.usdc.symbol || "USDC",
        decimals: 6,
        isNative: false,
        address: tokenAddresses.usdc as `0x${string}`,
        rawBalance: balances.usdc.balance,
        formattedBalance: balances.usdc.formatted,
      },
      {
        key: "dg",
        symbol: balances.dg.symbol || "DG",
        decimals: 18,
        isNative: false,
        address: (tokenAddresses.dg || null) as `0x${string}` | null,
        rawBalance: balances.dg.balance,
        formattedBalance: balances.dg.formatted,
      },
      {
        key: "up",
        symbol: balances.up.symbol || "UP",
        decimals: 18,
        isNative: false,
        address: (tokenAddresses.up || null) as `0x${string}` | null,
        rawBalance: balances.up.balance,
        formattedBalance: balances.up.formatted,
      },
    ];

    return tokens.filter((token) => token.isNative || !!token.address);
  }, [balances]);

  const selectedTransferToken =
    transferTokens.find((token) => token.key === selectedToken) || null;

  const amountError = useMemo(() => {
    if (!amount.trim() || !selectedTransferToken) return null;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return "Enter a valid amount";
    }
    try {
      parseUnits(amount.trim(), selectedTransferToken.decimals);
    } catch {
      return "Invalid amount format";
    }
    return null;
  }, [amount, selectedTransferToken]);

  const balanceExceeded = useMemo(() => {
    if (!amount.trim() || !selectedTransferToken) return false;
    try {
      const rawBalance = BigInt(selectedTransferToken.rawBalance || "0");
      const amountUnits = parseUnits(
        amount.trim(),
        selectedTransferToken.decimals,
      );
      return amountUnits > rawBalance;
    } catch {
      return false;
    }
  }, [amount, selectedTransferToken]);

  const canSubmitTransfer =
    !!selectedTransferToken &&
    !!amount.trim() &&
    (isAddress(recipient) || !!resolvedAddress) &&
    !amountError &&
    !balanceExceeded &&
    !isTransferring &&
    !loading;

  const copyAddress = () => {
    copyToClipboard(walletAddress, "Address copied to clipboard!");
  };

  const viewOnExplorer = () => {
    const explorerUrl = `${CURRENT_NETWORK.explorerUrl}/address/${walletAddress}`;
    window.open(explorerUrl, "_blank");
  };

  const downloadQR = () => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${walletAddress}&format=png&bgcolor=1a1b23&color=f97316&qzone=2`;
    const link = document.createElement("a");
    link.href = qrUrl;
    link.download = `wallet-qr-${shortAddress}.png`;
    link.click();
  };

  const setMaxAmount = () => {
    if (!selectedTransferToken) return;
    const raw = BigInt(selectedTransferToken.rawBalance || "0");
    if (selectedTransferToken.isNative) {
      const gasReserveWei = BigInt(10 ** 14); // 0.0001 ETH reserve for gas
      const adjusted = raw > gasReserveWei ? raw - gasReserveWei : 0n;
      setAmount(formatUnits(adjusted, 18));
      return;
    }
    setAmount(formatUnits(raw, selectedTransferToken.decimals));
  };

  const handleTransfer = async () => {
    if (!selectedTransferToken || isResolving) return;

    if (recipient.includes(".") && !resolvedAddress && !isAddress(recipient)) {
      toast.error("Waiting for ENS resolution...");
      return;
    }

    const finalRecipient = resolvedAddress || recipient.trim();
    if (!isAddress(finalRecipient)) {
      toast.error("Enter a valid recipient address or ENS name");
      return;
    }

    if (!amount.trim() || Number(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }

    try {
      const hash = selectedTransferToken.isNative
        ? await transferNative({
          recipient: finalRecipient as `0x${string}`,
          amountEth: amount.trim(),
        })
        : await transferErc20({
          recipient: finalRecipient as `0x${string}`,
          tokenAddress: selectedTransferToken.address as `0x${string}`,
          amount: amount.trim(),
          decimals: selectedTransferToken.decimals,
        });

      setAmount("");
      setRecipient("");
      setSelectedToken("");
      await refreshBalances();

      if (hash) {
        showTransactionSuccess(
          "Transfer submitted successfully",
          `${explorerBaseUrl}/tx/${hash}`,
        );
      } else {
        toast.success("Transfer submitted successfully");
      }
    } catch (err: any) {
      showDismissibleError(formatWalletError(err, "Transfer failed"));
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader className="px-6">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Wallet className="w-5 h-5 text-flame-yellow" />
            Wallet Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 max-h-[60vh] overflow-y-auto px-6 pb-6">
          {/* Network Info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Network:</span>
            <span className="font-medium text-white">{networkName}</span>
          </div>

          {/* Address Section */}
          <Card className="p-4 bg-muted/50">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Wallet Address</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyAddress}
                    className="h-8 w-8 p-0 hover:bg-background/80"
                    title="Copy Address"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={viewOnExplorer}
                    className="h-8 w-8 p-0 hover:bg-background/80"
                    title="View on Explorer"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="bg-background/60 rounded p-3 font-mono text-xs sm:text-sm break-all">
                {walletAddress}
              </div>
            </div>
          </Card>

          {/* Add DG Token Action */}
          {isAddAvailable && (
            <Button
              variant="outline"
              onClick={addDGToken}
              disabled={isAddLoading}
              className="w-full flex items-center justify-center gap-2 bg-orange-500/5 border-orange-500/20 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 transition-all py-6 border-dashed"
            >
              <Plus className="w-4 h-4" />
              <span className="font-bold">Add DG Token to Wallet</span>
            </Button>
          )}

          {/* Balances Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Balances</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshBalances}
                disabled={loading}
                className="h-8 w-8 p-0"
              >
                <RefreshCcw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>

            {error ? (
              <div className="text-red-400 text-sm text-center py-4">
                {error}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {/* ETH Balance */}
                <Card className="p-4 bg-muted/30">
                  <div className="text-center">
                    <div className="text-lg sm:text-xl font-bold">
                      {loading ? (
                        <div className="w-16 h-4 bg-muted animate-pulse rounded mx-auto" />
                      ) : (
                        balances.eth.formatted
                      )}
                    </div>
                    <div className="text-xs text-gray-400">ETH</div>
                  </div>
                </Card>

                {/* USDC Balance */}
                <Card className="p-4 bg-muted/30">
                  <div className="text-center">
                    <div className="text-lg sm:text-xl font-bold">
                      {loading ? (
                        <div className="w-16 h-4 bg-muted animate-pulse rounded mx-auto" />
                      ) : (
                        balances.usdc.formatted
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {balances.usdc.symbol}
                    </div>
                  </div>
                </Card>

                {/* DG Balance */}
                <Card className="p-4 bg-muted/30">
                  <div className="text-center">
                    <div
                      className="text-lg sm:text-xl font-bold"
                      title={balances.dg.fullFormatted}
                    >
                      {loading ? (
                        <div className="w-16 h-4 bg-muted animate-pulse rounded mx-auto" />
                      ) : (
                        balances.dg.formatted
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {balances.dg.symbol}
                    </div>
                  </div>
                </Card>

                {/* UP Balance */}
                <Card className="p-4 bg-muted/30">
                  <div className="text-center">
                    <div
                      className="text-lg sm:text-xl font-bold"
                      title={balances.up.fullFormatted}
                    >
                      {loading ? (
                        <div className="w-16 h-4 bg-muted animate-pulse rounded mx-auto" />
                      ) : (
                        balances.up.formatted
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {balances.up.symbol}
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* Transfer Section */}
          <div className="space-y-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-white tracking-tight uppercase">
                Transfer Assets
              </span>
              <span className="text-[10px] text-gray-500 uppercase font-semibold">
                {CURRENT_NETWORK.name}
              </span>
            </div>

            <div className="space-y-4">
              {/* Recipient Input */}
              <div className="group space-y-2 px-1">
                <Label
                  htmlFor="transfer-recipient"
                  className="text-xs font-semibold text-gray-400 ml-1 transition-colors group-focus-within:text-flame-yellow"
                >
                  Recipient Address
                </Label>
                <div className="relative group">
                  <Input
                    id="transfer-recipient"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="Recipient address or ENS..."
                    autoComplete="off"
                    className="h-14 w-full rounded-2xl border-gray-800 bg-black/40 pl-6 pr-12 font-mono text-sm text-white transition-all focus:border-flame-yellow/50 focus:bg-black/60 focus:ring-1 focus:ring-flame-yellow/20"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                    {isResolving ? (
                      <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    ) : recipient ? (
                      <button
                        type="button"
                        onClick={() => setRecipient("")}
                        className="p-1 rounded-full text-emerald-500/80 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all active:scale-90"
                        title="Clear input"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                {resolvedAddress && (
                  <div className="mt-1.5 px-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <span className="text-[10px] text-flame-yellow font-medium uppercase tracking-wider flex items-center gap-1.5 opacity-80">
                      <span className="w-1.5 h-1.5 rounded-full bg-flame-yellow animate-pulse" />
                      Resolves to: {resolvedAddress.substring(0, 10)}...
                      {resolvedAddress.substring(34)}
                    </span>
                  </div>
                )}
                {recipient.trim() &&
                  debouncedRecipient === recipient.trim() &&
                  !isAddress(recipient.trim()) &&
                  !isResolving &&
                  !resolvedAddress &&
                  (!recipient.includes(".") || resolutionAttempted) && (
                    <p className="ml-1 text-[10px] font-medium text-red-400/90 animate-in fade-in duration-300">
                      Invalid Ethereum address or ENS name
                    </p>
                  )}
              </div>
            </div>

            {/* Amount & Asset Input Stack */}
            <div className="space-y-2 px-1">
              <div className="flex items-center justify-between ml-1">
                <Label
                  htmlFor="transfer-amount"
                  className="text-xs font-semibold text-gray-400"
                >
                  Amount
                </Label>
                {selectedTransferToken && (
                  <span className="text-[10px] font-medium text-gray-500">
                    Balance:{" "}
                    <span className="text-gray-300">
                      {selectedTransferToken.formattedBalance}
                    </span>{" "}
                    {selectedTransferToken.symbol}
                  </span>
                )}
              </div>

              <div className="relative flex items-center gap-2">
                <div className="relative flex-1 group">
                  <Input
                    id="transfer-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0"
                    autoComplete="off"
                    className="h-14 w-full rounded-2xl border-gray-800 bg-black/40 pl-4 pr-16 text-xl font-bold text-white transition-all focus:border-flame-yellow/50 focus:bg-black/60 focus:ring-1 focus:ring-flame-yellow/20"
                  />
                  <button
                    type="button"
                    onClick={setMaxAmount}
                    disabled={!selectedTransferToken}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg bg-flame-yellow/10 px-2 py-1 text-[10px] font-black uppercase text-flame-yellow transition-all hover:bg-flame-yellow/20 active:scale-95 disabled:opacity-0"
                  >
                    Max
                  </button>
                </div>

                <div className="w-32">
                  <Select
                    value={selectedToken}
                    onValueChange={setSelectedToken}
                  >
                    <SelectTrigger className="h-14 rounded-2xl border-gray-800 bg-black/40 font-bold transition-all focus:ring-flame-yellow/20">
                      <SelectValue placeholder="Asset" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-800">
                      {transferTokens.map((token) => (
                        <SelectItem
                          key={token.key}
                          value={token.key}
                          className="focus:bg-flame-yellow/10 focus:text-flame-yellow"
                        >
                          {token.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-between items-center px-1 min-h-[16px]">
                {balanceExceeded ? (
                  <p className="text-[10px] font-medium text-red-400">
                    Amount exceeds available balance
                  </p>
                ) : amountError ? (
                  <p className="text-[10px] font-medium text-red-400">
                    {amountError}
                  </p>
                ) : (
                  <div />
                )}
              </div>
            </div>

            {/* Action Button */}
            <Button
              onClick={handleTransfer}
              disabled={!canSubmitTransfer}
              className="h-14 w-full rounded-2xl bg-gradient-to-r from-flame-yellow to-orange-600 text-lg font-black tracking-tight text-white shadow-lg shadow-flame-yellow/10 transition-all hover:scale-[1.01] hover:shadow-flame-yellow/20 active:scale-[0.98] disabled:from-gray-800 disabled:to-gray-900 disabled:text-gray-600 disabled:shadow-none"
            >
              {isTransferring ? (
                <div className="flex items-center gap-2">
                  <RefreshCcw className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </div>
              ) : (
                <span>Send {selectedTransferToken?.symbol ?? "Assets"}</span>
              )}
            </Button>
          </div>

          {/* QR Code Section */}
          <div className="space-y-3 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-white tracking-tight uppercase">
                QR Code
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={downloadQR}
                className="h-8 w-8 p-0 hover:bg-background/80"
                title="Download QR Code"
              >
                <Download className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex justify-center py-2">
              <div className="bg-white/5 p-4 rounded-3xl border border-white/10">
                <QRCodeDisplay address={walletAddress} size={140} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-border/50">
            <Button
              onClick={copyAddress}
              className="flex-1 sm:order-2 h-12 rounded-xl bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold transition-all"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Address
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 sm:order-1 h-12 rounded-xl border-gray-800 hover:bg-white/5 transition-all"
            >
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

import React from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import { CURRENT_NETWORK } from '@/lib/blockchain/frontend-config';
import {
  Copy,
  ExternalLink,
  RefreshCcw,
  Wallet,
  Download,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface WalletDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
}

// Simple QR Code generator using a service (you can replace with a library if preferred)
const QRCodeDisplay: React.FC<{ address: string; size?: number }> = ({ 
  address, 
  size = 140 
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
  const { balances, loading, error, refreshBalances, networkName } = useWalletBalances();

  const shortAddress = `${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 6)}`;

  const copyAddress = () => {
    navigator.clipboard.writeText(walletAddress);
    toast.success('Address copied to clipboard!');
  };

  const viewOnExplorer = () => {
    const explorerUrl = `${CURRENT_NETWORK.explorerUrl}/address/${walletAddress}`;
    window.open(explorerUrl, '_blank');
  };

  const downloadQR = () => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${walletAddress}&format=png&bgcolor=1a1b23&color=f97316&qzone=2`;
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `wallet-qr-${shortAddress}.png`;
    link.click();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md sm:max-w-lg bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Wallet className="w-5 h-5 text-flame-yellow" />
            Wallet Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6">
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
                <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {error ? (
              <div className="text-red-400 text-sm text-center py-4">
                {error}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                    <div className="text-xs text-gray-400">{balances.usdc.symbol}</div>
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* QR Code Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">QR Code</span>
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
            <div className="flex justify-center">
              <QRCodeDisplay address={walletAddress} size={140} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1 order-2 sm:order-1">
              Close
            </Button>
            <Button onClick={copyAddress} className="flex-1 order-1 sm:order-2">
              <Copy className="w-4 h-4 mr-2" />
              Copy Address
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
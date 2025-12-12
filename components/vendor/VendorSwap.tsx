/**
 * VendorSwap Component
 *
 * UI for buying and selling DG tokens through the vendor contract.
 * Requires GoodDollar verification to access.
 */

import { useState } from "react";
import { useDGMarket } from "@/hooks/vendor/useDGMarket";
import { useGoodDollarVerification } from "@/hooks/useGoodDollarVerification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function VendorSwap() {
    const verificationQuery = useGoodDollarVerification();
    const isCheckingWhitelist = verificationQuery.isLoading;
    const isWhitelisted = verificationQuery.data?.isWhitelisted ?? false;
    const { buyTokens, sellTokens, isPending, exchangeRate, feeConfig } = useDGMarket();
    const [amount, setAmount] = useState("");

    // Gate access for non-verified users
    if (isCheckingWhitelist) {
        return (
            <div className="p-4 bg-gray-800 rounded-lg animate-pulse">
                <div className="h-6 bg-gray-700 rounded w-1/2 mb-4"></div>
                <div className="h-10 bg-gray-700 rounded mb-4"></div>
                <div className="flex gap-4">
                    <div className="h-10 bg-gray-700 rounded flex-1"></div>
                    <div className="h-10 bg-gray-700 rounded flex-1"></div>
                </div>
            </div>
        );
    }

    if (!isWhitelisted) {
        return (
            <div className="p-4 bg-gray-800 rounded-lg text-center">
                <p className="text-red-500 font-medium">Verified users only</p>
                <p className="text-gray-400 text-sm mt-2">
                    Complete GoodDollar verification to access the DG Token Market
                </p>
            </div>
        );
    }

    const handleBuy = () => {
        if (amount && !isPending) {
            buyTokens(amount);
        }
    };

    const handleSell = () => {
        if (amount && !isPending) {
            sellTokens(amount);
        }
    };

    return (
        <div className="p-4 bg-gray-800 rounded-lg">
            <h3 className="text-xl font-bold mb-4 text-white">DG Token Market</h3>

            {/* Exchange Rate Info */}
            {exchangeRate !== undefined && (
                <div className="mb-4 p-2 bg-gray-700 rounded text-sm text-gray-300">
                    Exchange Rate: {exchangeRate.toString()}
                </div>
            )}

            {/* Fee Info */}
            {feeConfig && (
                <div className="mb-4 p-2 bg-gray-700 rounded text-sm text-gray-300">
                    <span>Buy Fee: {Number(feeConfig.buyFeeBps) / 100}%</span>
                    <span className="ml-4">Sell Fee: {Number(feeConfig.sellFeeBps) / 100}%</span>
                </div>
            )}

            {/* Amount Input */}
            <Input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount"
                className="mb-4 bg-gray-700 border-gray-600 text-white"
                disabled={isPending}
            />

            {/* Action Buttons */}
            <div className="flex gap-4">
                <Button
                    onClick={handleBuy}
                    disabled={isPending || !amount}
                    className="flex-1"
                >
                    {isPending ? "Processing..." : "Buy DG"}
                </Button>
                <Button
                    onClick={handleSell}
                    disabled={isPending || !amount}
                    variant="secondary"
                    className="flex-1"
                >
                    {isPending ? "Processing..." : "Sell DG"}
                </Button>
            </div>
        </div>
    );
}

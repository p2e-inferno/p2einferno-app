import React, { useState, useEffect } from "react";
import { CheckCircle, ExternalLink, ArrowLeft } from "lucide-react";
import { Button } from "./button";

interface SuccessScreenProps {
  title?: string;
  message?: string;
  transactionHash?: string;
  keyTokenId?: string;
  blockExplorerUrl?: string;
  countdownSeconds?: number;
  onRedirect: () => void;
  redirectLabel?: string;
  showCountdown?: boolean;
}

/**
 * Reusable success screen component with countdown and redirect functionality
 * Ideal for payment confirmations, transaction successes, etc.
 */
export function SuccessScreen({
  title = "Success!",
  message = "Operation completed successfully!",
  transactionHash,
  keyTokenId,
  blockExplorerUrl,
  countdownSeconds = 5,
  onRedirect,
  redirectLabel = "Return to Lobby",
  showCountdown = true,
}: SuccessScreenProps) {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const [isRedirecting, setIsRedirecting] = useState(false);

  useEffect(() => {
    if (!showCountdown) return;

    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown finished - auto redirect
      handleRedirect();
    }
  }, [countdown, showCountdown]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRedirect = () => {
    setIsRedirecting(true);
    onRedirect();
  };

  const progressPercentage = showCountdown
    ? ((countdownSeconds - countdown) / countdownSeconds) * 100
    : 100;

  return (
    <div className="text-center p-8 bg-green-50 rounded-lg border border-green-200 max-w-md mx-auto">
      {/* Success Icon with Animation */}
      <div className="relative mb-6">
        <CheckCircle className="w-20 h-20 text-green-500 mx-auto animate-bounce" />
        <div className="absolute inset-0 w-20 h-20 mx-auto rounded-full bg-green-500/20 animate-ping" />
      </div>

      {/* Title */}
      <h2 className="font-bold text-green-800 mb-3 text-2xl">{title}</h2>

      {/* Message */}
      <p className="text-green-700 mb-6">{message}</p>

      {/* Transaction Details */}
      {(transactionHash || keyTokenId) && (
        <div className="bg-green-100 rounded-lg p-4 mb-6 text-sm">
          {keyTokenId && (
            <div className="mb-2">
              <span className="font-medium text-green-800">Key Token ID: </span>
              <span className="font-mono text-green-600">{keyTokenId}</span>
            </div>
          )}
          {transactionHash && (
            <div className="mb-2">
              <span className="font-medium text-green-800">Transaction: </span>
              <span className="font-mono text-green-600 break-all text-xs">
                {transactionHash}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Progress Bar & Countdown */}
      {showCountdown && countdown > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-green-600">Auto-redirecting in:</span>
            <span className="font-bold text-green-700 text-lg">
              {countdown}s
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-green-200 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-3">
        {/* Primary Redirect Button */}
        <Button
          onClick={handleRedirect}
          disabled={isRedirecting}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors disabled:opacity-50"
        >
          {isRedirecting ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Redirecting...
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              {showCountdown && countdown > 0
                ? `${redirectLabel} Now`
                : redirectLabel}
            </div>
          )}
        </Button>

        {/* Block Explorer Link */}
        {blockExplorerUrl && transactionHash && (
          <a
            href={blockExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-green-600 hover:text-green-800 text-sm font-medium transition-colors"
          >
            View on Block Explorer
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Additional Actions */}
      <div className="mt-6 pt-4 border-t border-green-200">
        <p className="text-xs text-green-600">
          🎉 Your payment has been confirmed and recorded successfully!
        </p>
      </div>
    </div>
  );
}

import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Wallet, Flame, ArrowRight } from "lucide-react";
import { LobbyBackground } from "./lobby-background";

/**
 * Wallet connection prompt for the infernal lobby
 * Displays when user tries to access lobby without connecting wallet
 */
export const LobbyConnectWalletState: React.FC = () => {
  const { login, ready } = usePrivy();

  const handleConnect = () => {
    if (ready) {
      login();
    }
  };

  return (
    <div
      className="min-h-screen text-white overflow-x-hidden"
      style={{ backgroundColor: "#100F29" }}
    >
      <LobbyBackground />

      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md mx-auto">
          {/* Flame icon with pulsing animation */}
          <div className="relative mb-8">
            <Flame className="mx-auto w-20 h-20 text-flame-yellow animate-pulse" />
            <div className="absolute inset-0 w-20 h-20 mx-auto">
              <div className="w-full h-full rounded-full border-2 border-flame-yellow/30 animate-ping"></div>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            Welcome to the{" "}
            <span className="text-flame-yellow">Infernal Lobby</span>
          </h1>

          {/* Description */}
          <p className="text-faded-grey text-lg mb-8 leading-relaxed">
            Connect your wallet to access the lobby
          </p>

          {/* Wallet icon */}
          <div className="flex justify-center mb-8">
            <div className="p-4 rounded-full border border-steel-red/30 bg-steel-red/10">
              <Wallet className="w-8 h-8 text-steel-red" />
            </div>
          </div>

          {/* Connect button */}
          {!ready ? (
            <button
              disabled
              className="w-full bg-steel-red/50 text-white/50 font-bold py-4 px-8 rounded-full text-lg mb-4 cursor-not-allowed"
            >
              <div className="flex items-center justify-center">
                <div className="w-5 h-5 rounded-full bg-white/20 animate-pulse mr-3"></div>
                Initializing...
              </div>
            </button>
          ) : (
            <button
              onClick={handleConnect}
              className="group w-full bg-steel-red hover:bg-steel-red/90 text-white font-bold py-4 px-8 rounded-full text-lg transition-all transform hover:scale-105 mb-4"
            >
              <div className="flex items-center justify-center">
                <Wallet className="mr-3 h-5 w-5" />
                Connect Wallet
                <ArrowRight className="ml-3 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          )}

          {/* Decorative elements */}
          <div className="absolute -top-4 -left-4 w-24 h-24 bg-flame-yellow/5 rounded-full blur-xl"></div>
          <div className="absolute -bottom-4 -right-4 w-32 h-32 bg-steel-red/5 rounded-full blur-xl"></div>
        </div>
      </div>
    </div>
  );
};

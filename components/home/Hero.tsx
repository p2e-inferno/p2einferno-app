import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { ArrowRight, Gamepad2, DoorOpen } from "lucide-react";

export function Hero() {
  const { login, authenticated, ready } = usePrivy();

  const handleLogin = () => {
    login();
  };

  const handleBootcampRedirect = () => {
    try {
      window.location.href = "/#bootcamps";
    } catch (error) {
      console.error("Navigation error:", error);
    }
  };

  const handleEnterApp = () => {
    try {
      window.location.href = "/lobby";
    } catch (error) {
      console.error("Navigation error:", error);
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
      {/* Background Shapes */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-0 left-0 w-64 h-64 bg-steel-red/10 rounded-full filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute bottom-0 right-0 w-64 h-64 bg-flame-yellow/10 rounded-full filter blur-3xl opacity-50 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 container mx-auto text-center px-4">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-heading mb-6 tracking-tighter">
          P2E INFERNO
        </h1>
        <h2 className="text-2xl md:text-4xl lg:text-5xl font-bold font-heading mb-8 text-flame-yellow">
          The Onchain Economy as a Game
        </h2>
        <p className="max-w-2xl mx-auto text-lg md:text-xl text-faded-grey mb-12">
          Step into a world where every onchain action is part of an epic
          adventure. Swap tokens, trade NFTs, and engage with DeFi—all while
          leveling up your skills and earnings.
        </p>

        <div className="flex justify-center items-center gap-4 h-12">
          {!ready ? (
            <Button
              disabled
              className="bg-steel-red/50 text-white/50 font-bold py-3 px-6 rounded-full text-lg"
            >
              <div className="w-5 h-5 rounded-full bg-white/20 animate-pulse mr-2"></div>
              Loading...
            </Button>
          ) : !authenticated ? (
            <Button
              onClick={handleLogin}
              className="group bg-steel-red hover:bg-steel-red/90 text-white font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105"
            >
              Join the Inferno
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Button>
          ) : (
            <div className="flex gap-4">
              <Button
                onClick={handleBootcampRedirect}
                className="group bg-flame-yellow hover:bg-flame-yellow/90 text-black font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105"
              >
                Explore Bootcamps
                <Gamepad2 className="ml-2 h-5 w-5 transition-transform group-hover:rotate-12" />
              </Button>
              <Button
                onClick={handleEnterApp}
                className="group bg-steel-red hover:bg-steel-red/90 text-white font-bold py-3 px-6 rounded-full text-lg transition-transform transform hover:scale-105"
              >
                Enter App
                <DoorOpen className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
            </div>
          )}
        </div>

        <p className="mt-12 text-sm text-faded-grey/80">
          Infernals – Forged in Fire. Fueled by Rewards!
        </p>
      </div>
    </section>
  );
}

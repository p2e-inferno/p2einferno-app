import React, { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { ArrowRight, Gamepad2, DoorOpen } from "lucide-react";
import { getLogger } from "@/lib/utils/logger";
import { LeadMagnetModal } from "@/components/marketing/LeadMagnetModal";

const log = getLogger("home:Hero");

export function Hero() {
  const { login, authenticated, ready } = usePrivy();
  const [open, setOpen] = useState(false);

  const handleLogin = () => {
    login();
  };

  const handleBootcampRedirect = () => {
    try {
      window.location.href = "/#bootcamps";
    } catch (error) {
      log.error("Navigation error:", error);
    }
  };

  const handleEnterApp = () => {
    try {
      window.location.href = "/lobby";
    } catch (error) {
      log.error("Navigation error:", error);
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
        <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold font-heading mb-6 tracking-tight">
          Master Web3.0 Skills
          <br />
          Through Gamified Bootcamps,
          <br />
          Quests & Community
        </h1>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold font-heading mb-6 text-flame-yellow">
          Become Web3-Proficient in Weeks.
        </h2>
        <p className="max-w-3xl mx-auto text-base md:text-lg text-faded-grey mb-8">
          The fastest, most engaging way to learn about Ethereum, Web3,
          Decentralized Finance, and emerging tech — through guided cohorts,
          hands-on tasks, and rewards.
        </p>

        <div className="flex flex-col items-center gap-4 mb-8">
          <Button
            onClick={() => setOpen(true)}
            className="group bg-flame-yellow hover:bg-flame-yellow/90 text-black font-bold py-3 px-6 rounded-full text-base transition-transform transform hover:scale-105"
          >
            Get the Free Onchain Starter Kit
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Button>

          <div className="flex flex-wrap justify-center gap-3 mt-8">
            <Button
              variant="outline"
              onClick={handleBootcampRedirect}
              className="border-flame-yellow/50 text-flame-yellow hover:bg-flame-yellow/10"
            >
              Explore Bootcamps
              <Gamepad2 className="ml-2 h-5 w-5" />
            </Button>
            {ready && authenticated ? (
              <Button
                onClick={handleEnterApp}
                className="bg-steel-red hover:bg-steel-red/90 text-white"
              >
                Enter App
                <DoorOpen className="ml-2 h-5 w-5" />
              </Button>
            ) : (
              <Button
                onClick={handleLogin}
                className="bg-steel-red hover:bg-steel-red/90 text-white"
                disabled={!ready}
              >
                {ready ? "Connect Wallet" : "Loading..."}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-sm text-faded-grey/80">
          Infernals – Forged in Fire. Fueled by Rewards!
        </p>
      </div>

      <LeadMagnetModal
        open={open}
        onOpenChange={setOpen}
        defaultIntent="starter_kit"
        defaultSource="homepage_hero"
        title="Get the Onchain Starter Kit"
        description="Enter your email and we’ll send the Starter Kit + waitlist updates for new cohorts."
      />
    </section>
  );
}

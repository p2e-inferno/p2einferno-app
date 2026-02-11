import React, { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { ArrowRight, Gamepad2, DoorOpen, Swords } from "lucide-react";
import { LeadMagnetModal } from "@/components/marketing/LeadMagnetModal";
import { useRouter } from "next/router";

export function Hero() {
  const { login, authenticated, ready } = usePrivy();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleLogin = () => {
    login();
  };

  const handleBootcamps = () => {
    router.push("/#bootcamps");
  };

  const handleQuests = () => {
    router.push("/lobby/quests");
  };

  const handleEnterApp = () => {
    router.push("/lobby");
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
          Master Web3.0 and AI Skills
          <br />
          Through Gamified Bootcamps,
          <br />
          Quests & Rewards
        </h1>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold font-heading mb-6 text-flame-yellow">
          Become Web3.0 and AI Proficient in Weeks.
        </h2>
        <p className="max-w-3xl mx-auto text-base md:text-lg text-faded-grey mb-8">
          The most engaging way to learn about Web3.0, AI,
          Decentralized Finance, and emerging technologies — through guided cohorts,
          hands-on tasks, and rewards.
        </p>

        <div className="flex flex-col items-center gap-8 mb-8">
          <Button
            onClick={() => setOpen(true)}
            className="group bg-flame-yellow hover:bg-flame-yellow/90 text-black font-bold py-3 px-6 rounded-full text-base transition-transform transform hover:scale-105"
          >
            Get the Free Onchain Starter Kit
            <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Button>

          {/* Quick Access Grid */}
          <div className="grid grid-cols-3 gap-4 md:gap-12 w-full max-w-2xl px-2">
            {/* Explore Bootcamps */}
            <button
              onClick={handleBootcamps}
              className="flex flex-col items-center gap-3 group cursor-pointer transition-transform hover:-translate-y-1"
            >
              <div className="w-14 h-14 rounded-2xl bg-flame-yellow/10 border border-flame-yellow/20 flex items-center justify-center group-hover:bg-flame-yellow/20 group-hover:border-flame-yellow/50 transition-all duration-300 shadow-[0_0_15px_-5px_rgba(255,165,0,0.3)]">
                <Gamepad2 className="w-6 h-6 text-flame-yellow" />
              </div>
              <span className="text-sm font-bold text-white/90 group-hover:text-flame-yellow transition-colors whitespace-nowrap">
                See Bootcamps
              </span>
            </button>

            {/* Complete Quests */}
            <button
              onClick={handleQuests}
              className="flex flex-col items-center gap-3 group cursor-pointer transition-transform hover:-translate-y-1"
            >
              <div className="w-14 h-14 rounded-2xl bg-steel-red/10 border border-steel-red/20 flex items-center justify-center group-hover:bg-steel-red/20 group-hover:border-steel-red/50 transition-all duration-300 shadow-[0_0_15px_-5px_rgba(220,38,38,0.3)]">
                <Swords className="w-6 h-6 text-steel-red" />
              </div>
              <span className="text-sm font-bold text-white/90 group-hover:text-steel-red transition-colors whitespace-nowrap">
                Complete Quests
              </span>
            </button>

            {/* Enter App */}
            <button
              onClick={ready && authenticated ? handleEnterApp : handleLogin}
              className="flex flex-col items-center gap-3 group cursor-pointer transition-transform hover:-translate-y-1"
              disabled={!ready}
            >
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/20 group-hover:border-indigo-500/50 transition-all duration-300 shadow-[0_0_15px_-5px_rgba(99,102,241,0.3)]">
                <DoorOpen className="w-6 h-6 text-indigo-400" />
              </div>
              <span className="text-sm font-bold text-white/90 group-hover:text-indigo-400 transition-colors whitespace-nowrap">
                {ready
                  ? authenticated
                    ? "Enter App"
                    : "Get Started"
                  : "Loading..."}
              </span>
            </button>
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

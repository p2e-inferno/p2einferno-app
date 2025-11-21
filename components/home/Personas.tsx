import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadMagnetModal } from "@/components/marketing/LeadMagnetModal";
import { Sparkles, Code2, PenTool, Gamepad2, Bot } from "lucide-react";

type PersonaKey = "beginner" | "developer" | "creator" | "gamer" | "frontier";

interface Persona {
  key: PersonaKey;
  title: string;
  hero: string;
  learn: string;
  perfect: string;
  status: "live" | "coming";
  ctaLabel: string;
  icon: React.ComponentType<any>;
}

const personas: Persona[] = [
  {
    key: "beginner",
    title: "Beginner Bootcamp",
    hero: "Go from zero to confident in 4 weeks through our Infernal Sparks Bootcamp.",
    learn:
      "Learn: wallets, ENS, Web3 social, DeFi basics, DAOs, NFTs, onchain tools.",
    perfect: "Perfect For: newcomers, Web3 curious, crypto beginners.",
    status: "live",
    ctaLabel: "👉 View Infernal Sparks Bootcamp",
    icon: Sparkles,
  },
  {
    key: "developer",
    title: "Developer Bootcamp",
    hero: "Turn your coding skills into onchain apps.",
    learn:
      "Learn: smart contract basics, deploying dApps, working with EAS, automation tools.",
    perfect: "Perfect For: devs, hackers, builders ready for Web3.",
    status: "coming",
    ctaLabel: "👉 Join Developer Track Waitlist",
    icon: Code2,
  },
  {
    key: "creator",
    title: "Creator Bootcamp",
    hero: "Learn how to use blockchain to publish, sell, and distribute your creations.",
    learn:
      "Learn: Unlock Protocol, NFT releases, token-gated membership, fan communities, creator-owned economies.",
    perfect: "Perfect For: artists, storytellers, community builders.",
    status: "coming",
    ctaLabel: "👉 Join Creator Track Waitlist",
    icon: PenTool,
  },
  {
    key: "gamer",
    title: "Gamer Bootcamp",
    hero: "Participate in tournaments, quests, and gaming experiences powered by Ethereum.",
    learn:
      "Learn: blockchain-native games, rewards systems, guilds, web3-console interactions.",
    perfect:
      "Perfect For: casual/competitive gamers, explorers, guild players.",
    status: "coming",
    ctaLabel: "👉 Join Gamer Track Waitlist",
    icon: Gamepad2,
  },
  {
    key: "frontier",
    title: "Frontier-Tech Explorer",
    hero: "Explore AI, prompt engineering, and the intersection of blockchain and AI.",
    learn:
      "Learn: AI agents, how to create AI automations & workflows, how to craft effective AI prompts.",
    perfect: "Perfect For: Entrepreneurs, innovators, AI/Web3 enthusiasts.",
    status: "coming",
    ctaLabel: "👉 Join Frontier-Tech Track Waitlist",
    icon: Bot,
  },
];

export function Personas() {
  const [openPersona, setOpenPersona] = React.useState<PersonaKey | null>(null);

  return (
    <section className="py-16 md:py-24 bg-background" id="personas">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold font-heading mb-4">
            Choose Your Bootcamp Path
          </h2>
          <p className="text-base md:text-lg text-faded-grey max-w-3xl mx-auto">
            Pick your path into the onchain economy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {personas.map((persona) => {
            const Icon = persona.icon;
            const isLive = persona.status === "live";
            const isOpen = openPersona === persona.key;

            return (
              <Card
                key={persona.key}
                className={`bg-card border-border/60 h-full flex flex-col ${
                  !isLive ? "opacity-90" : ""
                }`}
              >
                <CardHeader className="space-y-3 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 text-flame-yellow">
                      <Icon className="w-6 h-6" />
                      <CardTitle className="text-xl font-heading text-white">
                        {persona.title}
                      </CardTitle>
                    </div>
                    <div className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border border-border/60 bg-background/60">
                      {isLive ? "Live" : "Coming Soon"}
                    </div>
                  </div>
                  <CardDescription className="text-base text-faded-grey space-y-3">
                    <p>{persona.hero}</p>
                    <p className="text-sm text-white">{persona.learn}</p>
                    <p className="text-xs uppercase tracking-wide text-faded-grey/80">
                      {persona.perfect}
                    </p>
                  </CardDescription>
                </CardHeader>

                <div className="px-6 pb-6">
                  {isLive ? (
                    <Button
                      className="w-full bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold"
                      onClick={() => (window.location.href = "/#bootcamps")}
                    >
                      {persona.ctaLabel}
                    </Button>
                  ) : (
                    <>
                      <Button
                        className="w-full bg-steel-red hover:bg-steel-red/90 text-white font-bold"
                        onClick={() => setOpenPersona(persona.key)}
                      >
                        {persona.ctaLabel}
                      </Button>
                      <LeadMagnetModal
                        open={isOpen}
                        onOpenChange={(next) =>
                          setOpenPersona(next ? persona.key : null)
                        }
                        defaultIntent="track_waitlist"
                        defaultSource={`homepage_persona_${persona.key}`}
                        defaultTrackLabel={persona.key}
                        title={`${persona.title} Waitlist`}
                        description="Drop your email and we’ll notify you when this bootcamp opens."
                      />
                    </>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}

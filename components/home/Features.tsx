import React from "react";
import { Coins, Shield, Users, Zap, Gamepad2, Trophy } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const features = [
  {
    title: "The Onchain Economy as a Game",
    description:
      "Every DeFi trade, NFT mint, and DAO vote is a quest. Every transaction is an achievement unlocked. The blockchain is your open-world game.",
    icon: Gamepad2,
    color: "text-flame-yellow",
  },
  {
    title: "True Digital Ownership",
    description:
      "Your in-game assets are NFTs that you truly own. Trade, sell, or use them across the ever-expanding onchain world.",
    icon: Shield,
    color: "text-steel-red",
  },
  {
    title: "Community-Driven Adventure",
    description:
      "Join the Infernals—a passionate community of players. Shape the future of the game through DAO governance and collaborative quests.",
    icon: Users,
    color: "text-faded-grey",
  },
  {
    title: "Gamified Learning & Onboarding",
    description:
      "From your first wallet setup to mastering complex DeFi strategies, our guided pathways make learning frictionless and rewarding.",
    icon: Zap,
    color: "text-flame-yellow",
  },
  {
    title: "Compete and Earn",
    description:
      "Rise through the ranks on our leaderboards, complete dynamic challenges, and earn meaningful rewards for your onchain skill.",
    icon: Trophy,
    color: "text-steel-red",
  },
  {
    title: "Endless Exploration",
    description:
      "The onchain world is always expanding. New protocols, new narratives, and new quests are always on the horizon. The game never ends.",
    icon: Coins,
    color: "text-faded-grey",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 md:py-32 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold font-heading">
            Why P2E INFERNO is Different
          </h2>
          <p className="mt-4 text-lg text-faded-grey max-w-3xl mx-auto">
            We don't just play games—we make the entire onchain experience feel
            like one. Here, participation is the ultimate adventure.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {features.map((feature, index) => (
            <Card
              key={index}
              className="bg-card border-border/50 hover:border-steel-red/50 transition-all duration-300 transform hover:-translate-y-2"
            >
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <div className={`p-3 bg-card rounded-full ${feature.color}`}>
                    <feature.icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="font-heading text-lg">
                    {feature.title}
                  </CardTitle>
                </div>
                <CardDescription className="pt-6 text-faded-grey">
                  {feature.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

import React from "react";
import Link from "next/link";
import { Coins, Shield, Users, Zap, Gamepad2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

const features = [
  {
    title: "GoodDollar Verification Unlocks Access",
    description:
      "Verify once to unlock gated quests and verified-only reward flows. This helps protect rewards from Sybil extraction and keeps participation fair for real users.",
    icon: Shield,
    color: "text-flame-yellow",
  },
  {
    title: "Real Onchain Actions",
    description:
      "Execute real swaps, mints, and governance votes from day one. No simulations, no theory-only lessons—just actual onchain transactions that build your muscle memory and confidence.",
    icon: Zap,
    color: "text-flame-yellow",
  },
  {
    title: "Deploy Real Smart Contracts",
    description:
      "Write, test, and deploy your own smart contracts to live networks. Learn Solidity through building, not just reading—and walk away with deployed code you can show the world.",
    icon: Shield,
    color: "text-steel-red",
  },
  {
    title: "Active Community Participation",
    description:
      "Join other Infernals and participate in shaping future of P2E INFERNO through DAO governance, collaborative quests, and community projects. Learn Web3 social dynamics by living them, not just studying them.",
    icon: Users,
    color: "text-faded-grey",
  },
  {
    title: "Quests Over Lectures",
    description:
      "Every lesson is a quest with real objectives and outcomes. Progress through structured challenges that turn complex blockchain concepts into achievable missions with clear rewards.",
    icon: Gamepad2,
    color: "text-flame-yellow",
  },
  {
    title: "Rewards Over Passive Learning",
    description:
      "Earn $DG and other rewards for completing milestones. Your education becomes an investment that pays back immediately—making Web3 learning both practical and profitable.",
    icon: Coins,
    color: "text-faded-grey",
  },
];

export function Features() {
  return (
    <section id="features" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold font-heading mb-4">
            Why P2E INFERNO is Different
          </h2>
          <p className="text-base md:text-lg text-faded-grey max-w-3xl mx-auto">
            We don&apos;t just teach Web3—we make you use it. Most people learn
            crypto by watching videos. Our learners go straight to doing.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
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

        <div className="text-center mt-10">
          <Link
            href="/gooddollar-verification"
            className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-blue-500/10 px-5 py-2 text-blue-300 hover:border-blue-400/60 hover:bg-blue-500/20 transition-colors"
          >
            GoodDollar Verification: How It Works
          </Link>
        </div>

        <div className="text-center mt-12">
          <p className="text-lg md:text-xl font-semibold text-flame-yellow">
            This is Web3 education that sticks.
          </p>
        </div>
      </div>
    </section>
  );
}

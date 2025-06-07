import React from "react";
import { Wallet, Gamepad2, Trophy, Coins } from "lucide-react";

const steps = [
  {
    icon: Wallet,
    title: "1. Connect & Onboard",
    description:
      "Your journey starts here. Connect your wallet and complete our gamified onboarding to learn the lay of the land. This is your first quest.",
    color: "text-steel-red",
  },
  {
    icon: Gamepad2,
    title: "2. Play the Onchain Game",
    description:
      "Engage in the onchain economy. Every swap, trade, and interaction is a move in the game. Explore quests, from simple trades to complex DeFi strategies.",
    color: "text-flame-yellow",
  },
  {
    icon: Trophy,
    title: "3. Master & Earn",
    description:
      "As you play, you'll level up your skills. Compete in challenges, climb the leaderboards, and earn real rewards for your mastery.",
    color: "text-steel-red",
  },
  {
    icon: Coins,
    title: "4. Shape the World",
    description:
      "Become an Infernal Flamekeeper. Use your influence to vote on governance proposals and help shape the future of the onchain world.",
    color: "text-flame-yellow",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 md:py-32 bg-background/70">
      <div className="container mx-auto px-4">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-bold font-heading">
            Your Path to Onchain Mastery
          </h2>
          <p className="mt-4 text-lg text-faded-grey max-w-2xl mx-auto">
            Follow these steps to transform from a novice to a master of the
            onchain economy.
          </p>
        </div>
        <div className="relative">
          {/* Timeline Connector */}
          <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-border hidden md:block" />

          {steps.map((step, index) => (
            <div
              key={index}
              className="flex md:items-center mb-12 md:mb-16 last:md:mb-0"
            >
              <div className="hidden md:flex md:w-1/2 items-center justify-end pr-8">
                {index % 2 === 0 && (
                  <div className="text-right">
                    <h3
                      className={`text-xl font-bold font-heading ${step.color}`}
                    >
                      {step.title}
                    </h3>
                    <p className="text-faded-grey mt-4">{step.description}</p>
                  </div>
                )}
              </div>

              {/* Icon */}
              <div className="relative w-full md:w-auto flex-shrink-0">
                <div className="absolute md:relative left-0 md:left-1/2 top-1 md:top-auto transform md:-translate-x-1/2 flex items-center justify-center w-12 h-12 rounded-full bg-card border-2 border-border">
                  <step.icon className={`w-6 h-6 ${step.color}`} />
                </div>
                <div className="ml-20 md:hidden">
                  <h3
                    className={`text-xl font-bold font-heading ${step.color}`}
                  >
                    {step.title}
                  </h3>
                  <p className="text-faded-grey mt-4">{step.description}</p>
                </div>
              </div>

              <div className="hidden md:flex md:w-1/2 items-center pl-8">
                {index % 2 !== 0 && (
                  <div>
                    <h3
                      className={`text-xl font-bold font-heading ${step.color}`}
                    >
                      {step.title}
                    </h3>
                    <p className="text-faded-grey mt-4">{step.description}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

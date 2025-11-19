import React from "react";
import { Target, CheckCircle, Trophy, BadgeCheck } from "lucide-react";

const steps = [
  {
    icon: Target,
    title: "1. Join a Track",
    description:
      "Choose the path that fits your goals — Beginner, Creator, Developer, Gamer, or Frontier-Tech.",
    color: "text-steel-red",
  },
  {
    icon: CheckCircle,
    title: "2. Complete Milestones",
    description:
      "Each milestone includes hands-on tasks, videos, guides, or webinars.",
    color: "text-flame-yellow",
  },
  {
    icon: Trophy,
    title: "3. Earn Rewards",
    description:
      "Collect $DG, unlock perks, climb leaderboards, and display your achievements.",
    color: "text-steel-red",
  },
  {
    icon: BadgeCheck,
    title: "4. Prove It Onchain",
    description:
      "Badges, attestations (EAS), and NFTs validate your skills onchain — forever.",
    color: "text-flame-yellow",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 md:py-24 bg-background/70">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 md:mb-16">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold font-heading mb-4">
            How It Works
          </h2>
          <p className="text-3xl md:text-4xl lg:text-5xl font-bold text-flame-yellow mb-6">
            Learn → Do → Earn → Prove
          </p>
          <p className="text-base md:text-lg text-faded-grey max-w-2xl mx-auto">
            Every bootcamp and quest inside P2E Inferno follows a proven
            structure designed for rapid skill development.
          </p>
        </div>
        <div className="relative">
          {/* Timeline Connector */}
          <div className="absolute left-1/2 transform -translate-x-1/2 h-full w-0.5 bg-border hidden md:block" />

          {steps.map((step, index) => (
            <div
              key={index}
              className="flex md:items-center mb-10 md:mb-12 last:md:mb-0"
            >
              <div className="hidden md:flex md:w-1/2 items-center justify-end pr-8">
                {index % 2 === 0 && (
                  <div className="text-right max-w-md">
                    <h3
                      className={`text-lg md:text-xl font-bold font-heading ${step.color} mb-2`}
                    >
                      {step.title}
                    </h3>
                    <p className="text-sm md:text-base text-faded-grey leading-relaxed">
                      {step.description}
                    </p>
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
                    className={`text-lg md:text-xl font-bold font-heading ${step.color} mb-2`}
                  >
                    {step.title}
                  </h3>
                  <p className="text-sm md:text-base text-faded-grey leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>

              <div className="hidden md:flex md:w-1/2 items-center pl-8">
                {index % 2 !== 0 && (
                  <div className="max-w-md">
                    <h3
                      className={`text-lg md:text-xl font-bold font-heading ${step.color} mb-2`}
                    >
                      {step.title}
                    </h3>
                    <p className="text-sm md:text-base text-faded-grey leading-relaxed">
                      {step.description}
                    </p>
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

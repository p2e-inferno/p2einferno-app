import React from "react";
import { Layers, Target, Users } from "lucide-react";

export function About() {
  return (
    <section id="about" className="py-20 md:py-32 bg-background/70">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <h2 className="text-3xl md:text-4xl font-bold font-heading">
              What is P2E INFERNO?
            </h2>
            <p className="text-lg text-faded-grey">
              P2E INFERNO is a blockchain gaming guild that enhances user
              interactions with blockchain technology through gamification and
              incentives. We see the entire onchain economy as a vast,
              open-world game, and we provide the tools, community, and guidance
              to help you master it.
            </p>
            <p className="text-lg text-faded-grey">
              Our mission is to make blockchain accessible and rewarding. Every
              trade, mint, and vote is a quest, and every successful transaction
              is an achievement unlocked. We transform passive participation
              into an active, engaging adventure.
            </p>
          </div>
          <div className="space-y-8">
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-card rounded-full text-steel-red border border-border/50">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-heading font-bold">
                  The Blockchain is the Game
                </h3>
                <p className="text-faded-grey mt-1">
                  We treat the onchain world as an endless game with limitless
                  opportunities to explore and earn.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-card rounded-full text-flame-yellow border border-border/50">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-heading font-bold">
                  Participation is the Quest
                </h3>
                <p className="text-faded-grey mt-1">
                  From your first trade to complex governance votes, every
                  action is a meaningful step in your journey.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-4">
              <div className="p-3 bg-card rounded-full text-faded-grey border border-border/50">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-heading font-bold">
                  Community is Your Party
                </h3>
                <p className="text-faded-grey mt-1">
                  Join the Infernals, a guild of like-minded players who support
                  each other in mastering the onchain economy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

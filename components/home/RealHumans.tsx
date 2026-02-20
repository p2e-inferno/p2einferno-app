import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function RealHumans() {
  return (
    <section className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center flex flex-col items-center">
          <h3 className="text-2xl md:text-3xl lg:text-4xl font-bold text-flame-yellow mb-6">
            Real Humans... Real Rewards!
          </h3>
          <p className="text-faded-grey text-base md:text-lg mb-8 leading-relaxed">
            In open blockchain systems, anyone can create unlimited wallets.
            Without verification, this makes it easy for a single person to
            claim rewards multiple times, breaking fairness and making
            meaningful progression impossible. GoodDollar verification helps
            solve this by confirming that each participant is a unique human.
            This allows P2E Inferno to ensure quests, rewards, and achievements
            reflect real participation—not automated or duplicate accounts.{" "}
          </p>
          <Link
            href="/gooddollar/verification"
            className="text-white hover:text-flame-yellow transition-colors inline-flex items-center gap-2 font-medium group text-sm md:text-base"
          >
            Learn how GoodDollar verification works
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}

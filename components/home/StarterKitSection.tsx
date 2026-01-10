import React from "react";
import { LeadMagnetForm } from "@/components/marketing/LeadMagnetForm";

export function StarterKitSection() {
  return (
    <section className="py-14 md:py-20 bg-background/80" id="starter-kit">
      <div className="container mx-auto px-4">
        <div className="rounded-2xl border border-border/60 bg-card/60 p-6 md:p-8 lg:p-10 grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-4">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-heading font-bold text-white">
              Get our free Web3 Starter Kit
            </h2>
            <p className="text-base md:text-lg text-faded-grey max-w-xl leading-relaxed">
              Get the 5 essential onchain actions every beginner must complete,
              a checklist to earn your first rewards, and a preview of our live
              bootcamp.
            </p>
            <ul className="space-y-2 text-sm md:text-base text-faded-grey">
              <li>✔ Your first 5 onchain actions</li>
              <li>✔ Web3 safety checklist</li>
              <li>✔ Beginner quests</li>
              <li>✔ ENS + Wallet quickstart</li>
              <li>✔ Web3 social guide</li>
            </ul>
          </div>
          <div>
            <LeadMagnetForm
              defaultIntent="starter_kit"
              defaultSource="homepage_mid"
              compact={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

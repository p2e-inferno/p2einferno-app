import React, { useState } from "react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { QUESTS_CONTENT } from "@/lib/content/quests";
import { LeadMagnetModal } from "@/components/marketing/LeadMagnetModal";
import { ArrowRight, CheckCircle2, Trophy, Package, Lock } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

export default function QuestsIndexPage() {
  const { hero, whySection, categories, rewards, questPacks, finalCta } =
    QUESTS_CONTENT;
  const [leadOpen, setLeadOpen] = useState(false);
  const { login, authenticated } = usePrivy();

  const scrollToQuests = () => {
    document
      .getElementById("quest-categories")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  const handleAuthAction = () => {
    if (authenticated) {
      // If already authenticated, redirect to lobby/app
      window.location.href = "/lobby";
    } else {
      login();
    }
  };

  const getAuthButtonText = () => {
    if (authenticated) return "Enter App";
    return "Get Started";
  };

  return (
    <MainLayout>
      <div className="bg-background border-b border-border/50 py-16 md:py-24 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[url('/images/grid-pattern.svg')] opacity-5 pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10 text-center">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold font-heading mb-6 tracking-tight">
              {hero.title}
            </h1>
            <p className="text-lg md:text-xl text-faded-grey leading-relaxed max-w-2xl mx-auto mb-12">
              {hero.subtitle}
            </p>

            {/* Hero Actions - Now inside the header */}
            <Button
              size="lg"
              className="bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg px-8 py-6"
              onClick={scrollToQuests}
            >
              {hero.ctaPrimary} <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Section 1: Why Quests Exist */}
      <section className="py-20 bg-card border-y border-border/50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <div>
              <h2 className="text-3xl font-bold font-heading mb-4">
                {whySection.title}
              </h2>
              <p className="text-xl text-faded-grey mb-8">
                {whySection.subtitle}
              </p>

              <div className="grid grid-cols-2 gap-4 mb-8">
                {whySection.benefits.map((benefit, i) => (
                  <div
                    key={i}
                    className="bg-background/50 p-4 rounded-lg border border-border/50 flex items-center"
                  >
                    <CheckCircle2 className="w-5 h-5 text-flame-yellow mr-3 flex-shrink-0" />
                    <span className="font-medium text-white">{benefit}</span>
                  </div>
                ))}
              </div>

              <p className="text-lg text-faded-grey italic border-l-4 border-flame-yellow pl-4">
                {whySection.description}
              </p>
            </div>

            {/* Rewards Preview */}
            <div className="bg-background/50 p-8 rounded-2xl border border-flame-yellow/20">
              <div className="text-center mb-6">
                <Trophy className="w-12 h-12 text-flame-yellow mx-auto mb-4" />
                <h3 className="text-2xl font-bold font-heading">
                  {rewards.title}
                </h3>
              </div>
              <ul className="space-y-4">
                {rewards.items.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-faded-grey border-b border-border/30 pb-2 last:border-0"
                  >
                    <span>{item}</span>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Quest Categories */}
      <section id="quest-categories" className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              Choose Your Mission
            </h2>
            <p className="text-faded-grey">Explore quests by category</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {categories.map((category, i) => (
              <Card
                key={i}
                className="bg-card border-border/50 hover:border-flame-yellow transition-all duration-300 group cursor-pointer"
                onClick={() => setLeadOpen(true)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-background rounded-full text-flame-yellow group-hover:bg-flame-yellow group-hover:text-black transition-colors">
                      <category.icon className="w-8 h-8" />
                    </div>
                    <Lock className="w-5 h-5 text-faded-grey group-hover:text-flame-yellow transition-colors" />
                  </div>
                  <CardTitle className="text-xl font-heading mb-2">
                    {category.title}
                  </CardTitle>
                  <CardDescription className="text-faded-grey text-base">
                    {category.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Quest Packs (Lead Magnets) */}
      <section className="py-20 bg-card/30 border-y border-border/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              Quest Packs
            </h2>
            <p className="text-faded-grey">
              Curated bundles to fast-track your progress
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {questPacks.map((pack, i) => (
              <div key={i} className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-flame-yellow/20 to-steel-red/20 rounded-xl blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative bg-background p-6 rounded-xl border border-border/50 hover:border-flame-yellow/50 transition-all flex items-start gap-4">
                  <div className="p-3 bg-card rounded-lg text-flame-yellow">
                    <Package className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold font-heading mb-2">
                      {pack.title}
                    </h3>
                    <p className="text-faded-grey text-sm mb-4">
                      {pack.description}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full border-flame-yellow/50 text-flame-yellow hover:bg-flame-yellow/10"
                      onClick={() => setLeadOpen(true)}
                    >
                      Get This Pack
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: Final CTA */}
      <section className="py-24 bg-gradient-to-b from-background to-card border-t border-border/50 text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-8">
            {finalCta.title}
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Button
              size="lg"
              className="bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg px-10 py-6"
              onClick={scrollToQuests}
            >
              {finalCta.primary}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-flame-yellow text-flame-yellow hover:bg-flame-yellow/10 font-bold text-lg px-10 py-6"
              onClick={handleAuthAction}
            >
              {getAuthButtonText()}
            </Button>
          </div>
        </div>
      </section>

      <LeadMagnetModal
        open={leadOpen}
        onOpenChange={setLeadOpen}
        defaultIntent="quest_pack"
        defaultSource="quests_index"
        title="Unlock Quests"
        description="Create an account or join the waitlist to access these quests."
      />
    </MainLayout>
  );
}

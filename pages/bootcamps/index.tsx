import React, { useState, useEffect } from "react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { BOOTCAMPS_CONTENT } from "@/lib/content/bootcamps";
import { BootcampCard } from "@/components/bootcamps/BootcampCard";
import { LeadMagnetModal } from "@/components/marketing/LeadMagnetModal";
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  ChevronDown,
  ChevronUp,
  Flame,
} from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";
import type { BootcampWithCohorts } from "@/lib/supabase/types";

const log = getLogger("pages:bootcamps");

export default function BootcampsIndexPage() {
  const {
    hero,
    whySection,
    tracks,
    upcomingBootcamps,
    includedFeatures,
    faq,
    finalCta,
  } = BOOTCAMPS_CONTENT;

  const [activeBootcamps, setActiveBootcamps] = useState<BootcampWithCohorts[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [leadOpen, setLeadOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const { authenticated, getAccessToken } = usePrivy();

  useEffect(() => {
    fetchBootcamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const fetchBootcamps = async () => {
    try {
      setLoading(true);
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      try {
        if (authenticated) {
          const token = await getAccessToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
      } catch {}

      const response = await fetch("/api/bootcamps", {
        method: "GET",
        headers,
      });

      if (!response.ok) throw new Error("Failed to fetch bootcamps");

      const result = await response.json();
      // Filter for bootcamps that have at least one cohort (active/upcoming/closed)
      // This matches the homepage logic
      const validBootcamps = (result.data || []).filter(
        (b: BootcampWithCohorts) => b.cohorts && b.cohorts.length > 0,
      );
      setActiveBootcamps(validBootcamps);
    } catch (err) {
      log.error("Error fetching bootcamps:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const scrollToBootcamps = () => {
    document
      .getElementById("available-bootcamps")
      ?.scrollIntoView({ behavior: "smooth" });
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
            <div className="flex flex-col sm:flex-row justify-center gap-6">
              <Button
                size="lg"
                className="bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg px-8 py-6"
                onClick={scrollToBootcamps}
              >
                {hero.ctaPrimary} <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-flame-yellow text-flame-yellow hover:bg-flame-yellow/10 font-bold text-lg px-8 py-6"
                onClick={() => setLeadOpen(true)}
              >
                {hero.ctaSecondary}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Why Bootcamps Exist */}
      <section className="py-20 bg-card border-y border-border/50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-6xl mx-auto">
            <div>
              <h2 className="text-3xl font-bold font-heading mb-4">
                {whySection.title}
              </h2>
              <p className="text-xl text-faded-grey mb-6">
                {whySection.subtitle}
              </p>
              <div className="bg-red-900/10 border border-red-500/20 p-6 rounded-xl mb-8">
                <p className="text-faded-grey italic">
                  &quot;{whySection.problem}&quot;
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="font-bold text-white">{whySection.solution}</h3>
                <ul className="space-y-3">
                  {whySection.features.map((feature, i) => (
                    <li key={i} className="flex items-center text-faded-grey">
                      <CheckCircle2 className="w-5 h-5 text-flame-yellow mr-3 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-background/50 p-8 rounded-2xl border border-flame-yellow/20 text-center">
              <div className="mb-8">
                <p className="text-2xl font-bold text-faded-grey line-through opacity-50 mb-2">
                  {whySection.transformation.from}
                </p>
                <ArrowRight className="w-8 h-8 text-flame-yellow mx-auto my-4 rotate-90 md:rotate-0" />
                <p className="text-3xl font-bold text-white text-shadow-glow">
                  {whySection.transformation.to}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: The 5 Tracks */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              The 5 Tracks
            </h2>
            <p className="text-faded-grey">
              Find the path that fits your goals
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {tracks.map((track, i) => (
              <Card
                key={i}
                className="bg-card border-border/50 hover:border-flame-yellow transition-all duration-300"
              >
                <CardHeader>
                  <div className="p-3 bg-background rounded-full w-fit mb-4 text-flame-yellow">
                    <track.icon className="w-8 h-8" />
                  </div>
                  <CardTitle className="text-xl font-heading mb-2">
                    {track.title}
                  </CardTitle>
                  <CardDescription className="text-faded-grey text-base">
                    {track.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Available Bootcamps */}
      <section
        id="available-bootcamps"
        className="py-20 bg-card/30 border-y border-border/50"
      >
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              Available Bootcamps
            </h2>
            <p className="text-faded-grey">
              Join a cohort and start learning today
            </p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-flame-yellow mx-auto"></div>
              <p className="mt-4 text-faded-grey">Loading bootcamps...</p>
            </div>
          ) : activeBootcamps.length > 0 ? (
            <div className="max-w-4xl mx-auto grid gap-8">
              {activeBootcamps.map((bootcamp) => (
                <BootcampCard key={bootcamp.id} bootcamp={bootcamp} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-background/50 rounded-xl border border-border/50 max-w-2xl mx-auto">
              <Flame className="w-12 h-12 text-faded-grey mx-auto mb-4" />
              <h3 className="text-xl font-bold text-faded-grey mb-2">
                No Active Bootcamps
              </h3>
              <p className="text-faded-grey mb-6">
                Check back soon for new cohorts!
              </p>
              <Button onClick={() => setLeadOpen(true)} variant="outline">
                Join Waitlist
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Section 4: Upcoming Bootcamps */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              Upcoming Bootcamps
            </h2>
            <p className="text-faded-grey">Coming soon to P2E Inferno</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {upcomingBootcamps.map((bootcamp, i) => (
              <div key={i} className="relative group">
                <div className="absolute inset-0 bg-background/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl">
                  <Lock className="w-8 h-8 text-flame-yellow mb-2" />
                  <Button
                    onClick={() => setLeadOpen(true)}
                    className="bg-flame-yellow text-black font-bold"
                  >
                    Join Waitlist
                  </Button>
                </div>
                <Card className="h-full bg-card border-border/50 opacity-70 group-hover:opacity-100 transition-all">
                  <CardHeader>
                    <div className="flex justify-between items-start mb-4">
                      <div className="p-2 bg-background rounded-full text-faded-grey">
                        <bootcamp.icon className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-bold px-2 py-1 rounded bg-background border border-border text-faded-grey">
                        {bootcamp.level}
                      </span>
                    </div>
                    <CardTitle className="text-xl font-heading mb-2">
                      {bootcamp.title}
                    </CardTitle>
                    <CardDescription>{bootcamp.description}</CardDescription>
                  </CardHeader>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 5: What's Included */}
      <section className="py-20 bg-card border-y border-border/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-12">
            Included in Every Bootcamp
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {includedFeatures.map((feature, i) => (
              <div
                key={i}
                className="p-4 bg-background/50 rounded-lg border border-border/50 flex flex-col items-center"
              >
                <CheckCircle2 className="w-8 h-8 text-flame-yellow mb-3" />
                <p className="text-sm font-medium text-faded-grey">{feature}</p>
              </div>
            ))}
          </div>
          <div className="mt-12">
            <Button
              size="lg"
              className="bg-flame-yellow text-black font-bold px-8 py-6"
              onClick={scrollToBootcamps}
            >
              Start Your Journey
            </Button>
          </div>
        </div>
      </section>

      {/* Section 6: FAQ */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold font-heading mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-4">
            {faq.map((item, i) => (
              <div
                key={i}
                className="border border-border/50 rounded-lg bg-card overflow-hidden"
              >
                <button
                  className="w-full px-6 py-4 text-left flex justify-between items-center hover:bg-background/50 transition-colors"
                  onClick={() => toggleFaq(i)}
                >
                  <span className="font-bold text-lg">{item.question}</span>
                  {openFaqIndex === i ? (
                    <ChevronUp className="w-5 h-5 text-flame-yellow" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-faded-grey" />
                  )}
                </button>
                {openFaqIndex === i && (
                  <div className="px-6 py-4 bg-background/30 border-t border-border/50 text-faded-grey">
                    {item.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 7: Final CTA */}
      <section className="py-24 bg-gradient-to-b from-background to-card border-t border-border/50 text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-8">
            {finalCta.title}
          </h2>
          <Button
            size="lg"
            className="bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg px-10 py-6"
            onClick={() => setLeadOpen(true)}
          >
            {finalCta.buttonText}
          </Button>
        </div>
      </section>

      <LeadMagnetModal
        open={leadOpen}
        onOpenChange={setLeadOpen}
        defaultIntent="bootcamp_waitlist"
        defaultSource="bootcamps_index"
        title="Join the Bootcamp Waitlist"
        description="Get notified when new cohorts open for enrollment."
      />
    </MainLayout>
  );
}

import React from "react";
import Link from "next/link";
import { MainLayout } from "@/components/layouts/MainLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ABOUT_CONTENT } from "@/lib/content/about";
import { ArrowRight, CheckCircle2, XCircle, Target } from "lucide-react";

export default function AboutPage() {
  const { hero, mission, problem, solution, tracks, whyOnchain, vision, cta } =
    ABOUT_CONTENT;

  return (
    <MainLayout>
      <PageHeader title={hero.title} description={hero.subtitle} />

      {/* Section 1: The Mission */}
      <section className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 text-center max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-8 text-flame-yellow">
            {mission.title}
          </h2>
          <p className="text-2xl md:text-3xl font-bold text-white mb-8 leading-tight">
            {mission.statement}
          </p>
          <div className="space-y-4 text-lg md:text-xl text-faded-grey">
            {mission.points.map((point, i) => (
              <p key={i}>{point}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Section 2 & 3: Problem & Solution */}
      <section className="py-20 bg-card/30 border-y border-border/50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 lg:gap-20">
            {/* Problem */}
            <div className="bg-background/50 p-8 rounded-2xl border border-red-900/30">
              <h3 className="text-2xl font-bold font-heading text-steel-red mb-6">
                {problem.title}
              </h3>
              <p className="text-faded-grey mb-6">{problem.description}</p>
              <ul className="space-y-3 mb-6">
                {problem.points.map((point, i) => (
                  <li key={i} className="flex items-start text-faded-grey">
                    <XCircle className="w-5 h-5 text-steel-red mr-3 flex-shrink-0 mt-1" />
                    {point}
                  </li>
                ))}
              </ul>
              <p className="font-semibold text-white italic">
                {problem.impact}
              </p>
            </div>

            {/* Solution */}
            <div className="bg-background/50 p-8 rounded-2xl border border-flame-yellow/30">
              <h3 className="text-2xl font-bold font-heading text-flame-yellow mb-6">
                {solution.title}
              </h3>
              <p className="text-faded-grey mb-6">{solution.description}</p>
              <ul className="space-y-3 mb-6">
                {solution.features.map((feature, i) => (
                  <li key={i} className="flex items-start text-faded-grey">
                    <CheckCircle2 className="w-5 h-5 text-flame-yellow mr-3 flex-shrink-0 mt-1" />
                    {feature}
                  </li>
                ))}
              </ul>
              <p className="font-semibold text-white italic">
                {solution.impact}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: The Five Tracks */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              The Five Tracks
            </h2>
            <p className="text-faded-grey text-lg">
              We serve all types of learners exploring Ethereum
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

      {/* Section 5: Why Onchain Learning Wins */}
      <section className="py-20 bg-card border-y border-border/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
            {whyOnchain.title}
          </h2>
          <p className="text-xl text-faded-grey mb-12">{whyOnchain.subtitle}</p>

          <div className="flex flex-wrap justify-center gap-8 mb-12">
            {whyOnchain.benefits.map((benefit, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-background border border-flame-yellow/30 flex items-center justify-center mb-4 text-flame-yellow">
                  <benefit.icon className="w-8 h-8" />
                </div>
                <span className="font-bold text-lg text-white">
                  {benefit.title}
                </span>
              </div>
            ))}
          </div>

          <div className="max-w-3xl mx-auto p-6 bg-background/50 rounded-xl border border-border/50">
            <p className="text-lg text-faded-grey italic">
              &quot;{whyOnchain.comparison}&quot;
            </p>
          </div>
        </div>
      </section>

      {/* Section 6: Vision */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-12">
            {vision.title}
          </h2>
          <div className="space-y-6">
            {vision.points.map((point, i) => (
              <div
                key={i}
                className="flex items-center justify-center text-xl md:text-2xl text-faded-grey"
              >
                <Target className="w-6 h-6 text-flame-yellow mr-4 flex-shrink-0" />
                {point}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 7: CTA */}
      <section className="py-24 bg-gradient-to-b from-background to-card border-t border-border/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-10">
            {cta.title}
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link
              href="/bootcamps"
              className="inline-flex items-center justify-center gap-2 rounded-md px-8 py-6 bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg whitespace-nowrap"
            >
              {cta.primary}{" "}
              <ArrowRight className="ml-2 w-5 h-5 flex-shrink-0" />
            </Link>
            <Link
              href="/bootcamps"
              className="inline-flex items-center justify-center rounded-md px-8 py-6 border border-flame-yellow text-flame-yellow hover:bg-flame-yellow/10 font-bold text-lg"
            >
              {cta.secondary}
            </Link>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}

import React from "react";
import Link from "next/link";
import { MainLayout } from "@/components/layouts/MainLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { HOW_IT_WORKS_CONTENT } from "@/lib/content/how-it-works";
import { ArrowRight, CheckCircle2 } from "lucide-react";

export default function HowItWorksPage() {
  const { hero, steps, whyItWorks, whatYouGet, valueEquation, cta } =
    HOW_IT_WORKS_CONTENT;

  return (
    <MainLayout>
      <PageHeader title={hero.title} description={hero.subtitle} />

      {/* Section 1: The 5 Steps */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              {/* Vertical Line */}
              <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 bg-border/50 transform md:-translate-x-1/2" />

              {steps.map((step, i) => (
                <div
                  key={i}
                  className="relative flex items-center mb-16 last:mb-0"
                >
                  {/* Mobile Layout (Left Aligned) */}
                  <div className="md:hidden flex w-full pl-20 relative">
                    <div className="absolute left-0 top-0 w-16 h-16 rounded-full bg-card border-2 border-flame-yellow flex items-center justify-center z-10">
                      <step.icon className="w-8 h-8 text-flame-yellow" />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-flame-yellow uppercase tracking-wider mb-1 block">
                        Step {i + 1}
                      </span>
                      <h3 className="text-xl font-bold font-heading mb-2">
                        {step.title}
                      </h3>
                      <p className="text-faded-grey">{step.description}</p>
                    </div>
                  </div>

                  {/* Desktop Layout (Alternating) */}
                  <div className="hidden md:flex w-full items-center justify-between">
                    <div
                      className={`w-[45%] ${i % 2 === 0 ? "text-right pr-8" : "order-last pl-8"}`}
                    >
                      <span className="text-sm font-bold text-flame-yellow uppercase tracking-wider mb-1 block">
                        Step {i + 1}
                      </span>
                      <h3 className="text-2xl font-bold font-heading mb-2">
                        {step.title}
                      </h3>
                      <p className="text-lg text-faded-grey">
                        {step.description}
                      </p>
                    </div>

                    <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-card border-4 border-background ring-2 ring-flame-yellow flex items-center justify-center z-10">
                      <step.icon className="w-8 h-8 text-flame-yellow" />
                    </div>

                    <div className="w-[45%]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Why This Works */}
      <section className="py-20 bg-card border-y border-border/50">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold font-heading mb-6">
                {whyItWorks.title}
              </h2>
              <p className="text-xl text-faded-grey mb-8">
                {whyItWorks.subtitle}
              </p>
              <div className="p-6 bg-background/50 rounded-xl border border-red-900/30">
                <ul className="space-y-4">
                  {whyItWorks.problems.map((problem, i) => (
                    <li key={i} className="flex items-center text-faded-grey">
                      <span className="w-2 h-2 bg-steel-red rounded-full mr-3" />
                      {problem}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="text-center md:text-left">
              <div className="text-6xl md:text-8xl font-bold text-flame-yellow opacity-20 mb-4">
                FIXED
              </div>
              <h3 className="text-3xl font-bold font-heading text-white mb-6">
                {whyItWorks.solution}
              </h3>
              <p className="text-lg text-faded-grey leading-relaxed">
                By structuring the chaos of Web3 into a clear, gamified path, we
                remove the friction that causes 90% of users to quit.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: What You Get */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-12">
            {whatYouGet.title}
          </h2>
          <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
            {whatYouGet.items.map((item, i) => (
              <div
                key={i}
                className="px-6 py-4 bg-card border border-border/50 rounded-full flex items-center text-lg font-medium text-faded-grey hover:text-white hover:border-flame-yellow transition-colors"
              >
                <CheckCircle2 className="w-5 h-5 text-flame-yellow mr-3" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 4: The Psychology (Value Equation) */}
      <section className="py-20 bg-card/30 border-t border-border/50">
        <div className="container mx-auto px-4 max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              {valueEquation.title}
            </h2>
            <p className="text-faded-grey">How we maximize your success rate</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Increase */}
            <div className="bg-green-900/10 border border-green-500/20 p-8 rounded-2xl">
              <h3 className="text-xl font-bold text-green-400 mb-6 flex items-center">
                <ArrowRight className="w-5 h-5 mr-2 rotate-[-45deg]" /> We
                Increase
              </h3>
              <div className="space-y-6">
                {valueEquation.increase.map((item, i) => (
                  <div key={i}>
                    <p className="text-sm text-faded-grey uppercase tracking-wider mb-1">
                      {item.label}
                    </p>
                    <p className="text-xl font-bold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Decrease */}
            <div className="bg-red-900/10 border border-red-500/20 p-8 rounded-2xl">
              <h3 className="text-xl font-bold text-red-400 mb-6 flex items-center">
                <ArrowRight className="w-5 h-5 mr-2 rotate-[45deg]" /> We
                Decrease
              </h3>
              <div className="space-y-6">
                {valueEquation.decrease.map((item, i) => (
                  <div key={i}>
                    <p className="text-sm text-faded-grey uppercase tracking-wider mb-1">
                      {item.label}
                    </p>
                    <p className="text-xl font-bold text-white">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: CTA */}
      <section className="py-24 bg-background text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl font-bold font-heading mb-10">
            Start Your Journey Today
          </h2>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
            <Link
              href="/bootcamps"
              className="inline-flex items-center justify-center gap-2 rounded-md px-8 py-6 bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg"
            >
              {cta.primary} <ArrowRight className="ml-2 w-5 h-5" />
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

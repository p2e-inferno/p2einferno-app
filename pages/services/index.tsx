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
import { SERVICES_OVERVIEW, ALL_SERVICES } from "@/lib/content/services";
import { ArrowRight, CheckCircle2, Target } from "lucide-react";

export default function ServicesPage() {
  const { title, subtitle, whySection, targetAudience, process, proofMetrics } =
    SERVICES_OVERVIEW;

  return (
    <MainLayout>
      <PageHeader title={title} description={subtitle} />

      {/* Section 1: Why These Services Exist */}
      <section className="py-16 bg-background">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold font-heading">
              {whySection.title}
            </h2>
            <p className="text-xl text-faded-grey leading-relaxed">
              {whySection.problem}
            </p>
            <div className="p-6 bg-card border border-border/50 rounded-lg">
              <p className="text-lg text-white">{whySection.description}</p>
            </div>
            <p className="text-2xl font-bold text-flame-yellow uppercase tracking-wide">
              {whySection.tagline}
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: The Six Services (Grid) */}
      <section
        id="services-list"
        className="py-16 bg-background/50 border-y border-border/50"
      >
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold font-heading">
              Our Services
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ALL_SERVICES.map((service) => (
              <Link
                href={`/services/${service.slug}`}
                key={service.slug}
                className="group"
              >
                <Card className="h-full bg-card border-border/50 hover:border-flame-yellow transition-all duration-300 hover:-translate-y-1">
                  <CardHeader>
                    <div className="p-3 bg-background rounded-full w-fit mb-4 text-flame-yellow group-hover:text-white transition-colors">
                      <service.icon className="w-8 h-8" />
                    </div>
                    <CardTitle className="text-xl font-heading mb-2">
                      {service.title.split(" ").slice(0, 4).join(" ")}...
                    </CardTitle>
                    <CardDescription className="text-faded-grey line-clamp-3">
                      {service.subtitle}
                    </CardDescription>
                    <div className="pt-4 flex items-center text-sm font-semibold text-flame-yellow group-hover:text-white">
                      Learn More <ArrowRight className="w-4 h-4 ml-2" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3 & 4: Process & Audience */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            {/* Audience */}
            <div>
              <h3 className="text-2xl font-bold font-heading mb-6">
                Who This Is For
              </h3>
              <div className="space-y-4">
                {targetAudience.map((item, i) => (
                  <div key={i} className="flex items-center space-x-3">
                    <Target className="w-5 h-5 text-steel-red flex-shrink-0" />
                    <span className="text-lg text-faded-grey">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Process */}
            <div>
              <h3 className="text-2xl font-bold font-heading mb-6">
                The Delivery Process
              </h3>
              <div className="space-y-6">
                {process.map((step, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-flame-yellow text-black font-bold flex items-center justify-center">
                      {i + 1}
                    </div>
                    <div>
                      <h4 className="font-bold text-white">{step.title}</h4>
                      <p className="text-faded-grey">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Proof & Final CTA */}
      <section className="py-20 bg-card border-t border-border/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold font-heading mb-10">
            Outcomes That Matter
          </h2>
          <div className="flex flex-wrap justify-center gap-4 mb-16">
            {proofMetrics.map((metric, i) => (
              <span
                key={i}
                className="px-6 py-3 bg-background rounded-full border border-border/50 text-faded-grey font-medium flex items-center"
              >
                <CheckCircle2 className="w-4 h-4 mr-2 text-green-500" />
                {metric}
              </span>
            ))}
          </div>

          <div className="max-w-2xl mx-auto p-8 bg-background rounded-2xl border border-flame-yellow/30">
            <h3 className="text-2xl font-bold font-heading mb-4">
              Activate Your Ecosystem
            </h3>
            <p className="text-faded-grey mb-8">
              Onboard smarter. Educate better.
            </p>
            <a
              href="https://meetwith.xyz/address/0xdfe26b299c80a3742e1a3571a629f8279fe7b22c"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full md:w-auto rounded-md px-8 py-3 bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold"
            >
              {SERVICES_OVERVIEW.ctaPrimary}
            </a>
          </div>
        </div>
      </section>
    </MainLayout>
  );
}

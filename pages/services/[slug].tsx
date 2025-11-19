import React from "react";
import { GetStaticPaths, GetStaticProps } from "next";
import { useRouter } from "next/router";
import Link from "next/link";
import { MainLayout } from "@/components/layouts/MainLayout";
import { PageHeader } from "@/components/ui/PageHeader";
import { ALL_SERVICES, ServiceContent } from "@/lib/content/services";
import {
  ArrowLeft,
  Check,
  XCircle,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

interface ServiceDetailProps {
  service: Omit<ServiceContent, "icon">; // Exclude icon from props passed from getStaticProps
}

export default function ServiceDetailPage({ service }: ServiceDetailProps) {
  const router = useRouter();

  if (router.isFallback) {
    return <div>Loading...</div>;
  }

  if (!service) return null;

  return (
    <MainLayout>
      {/* Breadcrumb / Back Link */}
      <div className="bg-background pt-8 pb-4">
        <div className="container mx-auto px-4">
          <Link
            href="/services"
            className="inline-flex items-center text-faded-grey hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Services
          </Link>
        </div>
      </div>

      <PageHeader title={service.title} description={service.subtitle} />

      <div className="bg-background py-16">
        <div className="container mx-auto px-4">
          {/* Primary CTA */}
          <div className="flex justify-center mb-20">
            <a
              href={service.ctaLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md px-8 py-6 bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg"
            >
              {service.ctaPrimary}
            </a>
          </div>

          <div className="grid md:grid-cols-2 gap-12 lg:gap-20 max-w-6xl mx-auto">
            {/* Problem Column */}
            <div className="bg-card/50 border border-red-900/20 rounded-2xl p-8">
              <h2 className="text-2xl font-bold font-heading text-steel-red mb-6 border-b border-red-900/20 pb-4">
                The Problem
              </h2>
              <p className="text-lg font-semibold mb-4 text-white">
                {service.problem.title}
              </p>
              <ul className="space-y-4">
                {service.problem.points.map((point, i) => (
                  <li key={i} className="flex items-start text-faded-grey">
                    <XCircle className="w-5 h-5 text-steel-red mr-3 flex-shrink-0 mt-1" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Solution Column */}
            <div className="bg-card border border-flame-yellow/20 rounded-2xl p-8">
              <h2 className="text-2xl font-bold font-heading text-flame-yellow mb-6 border-b border-flame-yellow/20 pb-4">
                The Solution
              </h2>
              <p className="text-lg font-semibold mb-4 text-white">
                {service.solution.title}
              </p>
              <ul className="space-y-4">
                {service.solution.points.map((point, i) => (
                  <li key={i} className="flex items-start text-faded-grey">
                    <CheckCircle className="w-5 h-5 text-flame-yellow mr-3 flex-shrink-0 mt-1" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Deliverables & Outcomes */}
      <div className="bg-card py-20 border-y border-border/50">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <h3 className="text-2xl font-bold font-heading mb-6">
                Deliverables
              </h3>
              <ul className="space-y-3">
                {service.deliverables.map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center text-faded-grey bg-background/50 p-3 rounded-lg border border-border/50"
                  >
                    <Check className="w-4 h-4 text-flame-yellow mr-3" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {service.outcomes && (
              <div>
                <h3 className="text-2xl font-bold font-heading mb-6">
                  Outcomes
                </h3>
                <div className="space-y-4">
                  {service.outcomes.map((outcome, i) => (
                    <div key={i} className="flex items-start">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-2 mr-3" />
                      <span className="text-lg text-white">{outcome}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="bg-background py-20 text-center">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold font-heading mb-8">
            Ready to Start?
          </h2>
          <a
            href={service.ctaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md px-10 py-6 bg-flame-yellow text-black hover:bg-flame-yellow/90 font-bold text-lg"
          >
            {service.ctaPrimary} <ArrowRight className="ml-2 w-5 h-5" />
          </a>
        </div>
      </div>
    </MainLayout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = ALL_SERVICES.map((service) => ({
    params: { slug: service.slug },
  }));

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const serviceData = ALL_SERVICES.find((s) => s.slug === params?.slug);

  if (!serviceData) {
    return { notFound: true };
  }

  // Create a copy of the service object without the icon component
  // Lucide icons are React components (functions/objects) and cannot be serialized by JSON
  const { icon, ...service } = serviceData;

  return {
    props: {
      service,
    },
  };
};

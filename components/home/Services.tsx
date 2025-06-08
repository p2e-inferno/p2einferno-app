import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  BookOpen,
  Users,
  Calendar,
  Network,
  Ticket,
  Briefcase,
} from "lucide-react";

const services = [
  {
    icon: BookOpen,
    title: "Education",
    description:
      "Hands-on workshops, tutorials, and live webinars on Web3, AI, and automation.",
  },
  {
    icon: Users,
    title: "Onboarding & Mentoring",
    description:
      "Personalized coaching and mentoring to guide you from beginner to onchain master.",
  },
  {
    icon: Calendar,
    title: "Events",
    description:
      "Compete in contests and tournaments, or connect at epic parties with exciting rewards.",
  },
  {
    icon: Ticket,
    title: "NFT Ticketing",
    description:
      "Sell tickets for your events seamlessly as digital collectibles.",
  },
  {
    icon: Briefcase,
    title: "Consulting",
    description:
      "Expert guidance on Ethereum, AI, automation, and community building.",
  },
  {
    icon: Network,
    title: "Community Building",
    description:
      "We create, develop, and nurture grassroots communities, strategically aligned with your ecosystem.",
  },
];

export function Services() {
  return (
    <section id="services" className="py-20 md:py-32 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold font-heading">
            Our Services
          </h2>
          <p className="mt-4 text-lg text-faded-grey max-w-3xl mx-auto">
            We provide a suite of services designed to enhance your journey
            through the onchain economy.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {services.map((service, index) => (
            <Card
              key={index}
              className="bg-card border-border/50 hover:border-flame-yellow/50 transition-all duration-300 transform hover:-translate-y-2"
            >
              <CardHeader>
                <div className="flex items-center space-x-4">
                  <div className="p-3 bg-card rounded-full text-flame-yellow">
                    <service.icon className="w-6 h-6" />
                  </div>
                  <CardTitle className="font-heading text-lg">
                    {service.title}
                  </CardTitle>
                </div>
                <CardDescription className="pt-6 text-faded-grey">
                  {service.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

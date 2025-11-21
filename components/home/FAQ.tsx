import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqItems = [
  {
    question: "Is this only for beginners?",
    answer:
      "No — we have 5 tracks for different skill levels. Infernal Sparks is beginner-friendly.",
  },
  {
    question: "How much time does the bootcamp require?",
    answer: "About 3–5 hours per week.",
  },
  {
    question: "Do I need crypto to start?",
    answer:
      "No. Most beginner tasks do not require crypto — We guide you through everything. However, if you choose to pay for bootcamps using crypto, you will need to have some USDC in your wallet, and some ETH for gas.",
  },
  {
    question: "What rewards can I earn?",
    answer: "Token rewards, NFTs, perks, and onchain badges.",
  },
  {
    question: "Is the app free?",
    answer:
      "Exploring quests and community is free. Bootcamps are paid and require enrollment.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4 max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold font-heading mb-4">
            FAQ
          </h2>
          <p className="text-base md:text-lg text-faded-grey">
            Everything you need to know to get started.
          </p>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {faqItems.map((item) => (
            <AccordionItem key={item.question} value={item.question}>
              <AccordionTrigger className="text-left text-base md:text-lg text-white">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-base md:text-lg leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

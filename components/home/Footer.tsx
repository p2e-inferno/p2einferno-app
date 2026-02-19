import React from "react";
import Link from "next/link";
import {
  Gamepad2,
  Twitter,
  Github,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import { LeadMagnetModal } from "@/components/marketing/LeadMagnetModal";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const [open, setOpen] = React.useState(false);

  const socialLinks = [
    {
      name: "Discord",
      icon: MessageCircle,
      href: "https://bit.ly/p2einferno_community",
    },
    {
      name: "Twitter",
      icon: Twitter,
      href: "https://x.com/p2einferno",
    },
    { name: "GitHub", icon: Github, href: "https://github.com/p2e-inferno" },
  ];

  const footerSections = {
    Navigate: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
      { label: "How It Works", href: "/how-it-works" },
    ],
    Features: [
      { label: "Bootcamps", href: "/bootcamps" },
      { label: "Quests", href: "/quests" },
      { label: "Services", href: "/services" },
    ],
    Resources: [
      { label: "Creator starter kit", href: "#" },
      {
        label: "GoodDollar Verification Guide",
        href: "/gooddollar/verification",
      },
      {
        label: "Speedrun Ethereum",
        href: "https://speedrunethereum.com/?utm_source=p2einferno&utm_medium=referral&utm_campaign=footer_resources",
      },
      { label: "DG Token Vendor", href: "https://vendor.dreadgang.gg" },
    ],
  };

  return (
    <footer className="bg-card border-t border-border/50">
      <div className="bg-background/40 border-b border-border/50">
        <div className="container mx-auto px-4 py-6 flex flex-col md:flex-row items-center gap-4 justify-between">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-flame-yellow" />
            <div>
              <p className="font-semibold text-white">
                Start your onchain journey today
              </p>
              <p className="text-xs text-faded-grey">
                Get the Starter Kit and cohort updates.
              </p>
            </div>
          </div>
          <div>
            <button
              className="inline-flex items-center gap-2 rounded-full bg-flame-yellow text-black px-5 py-2 font-semibold hover:bg-flame-yellow/90"
              onClick={() => setOpen(true)}
            >
              Get Starter Kit
            </button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand and Socials */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center space-x-2 mb-4">
              <Gamepad2 className="w-8 h-8 text-flame-yellow" />
              <span className="text-xl font-bold font-heading">
                P2E INFERNO
              </span>
            </Link>
            <p className="text-faded-grey text-sm mb-8">
              The onchain economy as a game.
            </p>
            <div className="flex space-x-4">
              {socialLinks.map((link) => (
                <a
                  key={link.name}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-faded-grey hover:text-white transition-colors"
                >
                  <link.icon className="w-5 h-5" />
                  <span className="sr-only">{link.name}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Footer Links */}
          {Object.entries(footerSections).map(([title, links]) => (
            <div key={title}>
              <h3 className="font-heading text-lg font-semibold mb-4">
                {title}
              </h3>
              <ul className="space-y-4">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-faded-grey hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-12 border-t border-border/50 text-center text-sm text-faded-grey">
          <p>&copy; {currentYear} P2E INFERNO. All rights reserved.</p>
          <p className="mt-2">Forged in Fire. Fueled by Rewards.</p>
        </div>
      </div>

      <LeadMagnetModal
        open={open}
        onOpenChange={setOpen}
        defaultIntent="starter_kit"
        defaultSource="footer_cta"
        title="Get the Onchain Starter Kit"
        description="Enter your email to receive the Starter Kit and cohort updates."
      />
    </footer>
  );
}

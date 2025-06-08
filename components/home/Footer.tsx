import React from "react";
import Link from "next/link";
import {
  Gamepad2,
  Twitter,
  Github,
  MessageCircle,
  FileText,
} from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    {
      name: "Discord",
      icon: MessageCircle,
      href: "https://discord.gg/your-server",
    },
    {
      name: "Twitter",
      icon: Twitter,
      href: "https://twitter.com/your-profile",
    },
    { name: "GitHub", icon: Github, href: "https://github.com/your-org" },
    { name: "Docs", icon: FileText, href: "/docs" },
  ];

  const footerSections = {
    Navigate: [
      { label: "Home", href: "/" },
      { label: "Features", href: "#features" },
      { label: "About", href: "#about" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Services", href: "#services" },
    ],
    Community: [
      { label: "Become an Infernal", href: "#" },
      { label: "Leaderboards", href: "#" },
      { label: "DAO Governance", href: "#" },
    ],
    Resources: [
      { label: "Whitepaper", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Support", href: "#" },
    ],
  };

  return (
    <footer className="bg-card border-t border-border/50">
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
    </footer>
  );
}

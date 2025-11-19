import {
  Target,
  Users,
  Zap,
  Shield,
  Globe,
  Code,
  Wallet,
  Cpu,
  Gamepad2,
  PenTool,
} from "lucide-react";

export const ABOUT_CONTENT = {
  hero: {
    title: "Making Web3 Accessible, Actionable & Rewarding",
    subtitle: "We’re building the leading gamified onchain education ecosystem — where learning creates real value.",
  },
  mission: {
    title: "The Mission",
    statement: "To make blockchain accessible and rewarding.",
    points: [
      "Every trade, mint, cast, vote, deploy, or experiment becomes a quest.",
      "Every onchain action becomes proof of progress.",
      "Because when you remove confusion and add structure + rewards, people actually learn.",
    ],
  },
  problem: {
    title: "The Problem We’re Solving",
    description: "Web3 protocols, DAOs, and creators all want adoption. But users are blocked by:",
    points: [
      "Unclear onboarding",
      "Lack of guided learning paths",
      "Fear of making mistakes",
      "No sense of progression",
      "No proof they’ve learned anything",
      "Zero motivation to stay engaged",
    ],
    impact: "This creates drop-off, confusion, and lost users.",
  },
  solution: {
    title: "Our Solution",
    description: "We built a multi-track bootcamp + quest ecosystem that turns users into confident onchain participants.",
    features: [
      "Milestone-based Bootcamps",
      "Daily/Weekly Quests",
      "Onchain Achievements",
      "Community Challenges & Events",
      "Real Rewards (DG)",
      "Education & Mentoring",
    ],
    impact: "This creates a complete onchain learning funnel from beginner → advanced.",
  },
  tracks: [
    {
      title: "Developer Track",
      description: "Build smart contracts, automations, agents, dApps.",
      icon: Code,
    },
    {
      title: "Newcomer Track",
      description: "Wallets, ENS, DeFi, NFTs, social, governance.",
      icon: Wallet,
    },
    {
      title: "Frontier-Tech Explorer Track",
      description: "AI agents, automations, advanced onchain systems.",
      icon: Cpu,
    },
    {
      title: "Gamer Track",
      description: "Onchain gaming, Ethereum powered tournaments, Token rewards.",
      icon: Gamepad2,
    },
    {
      title: "Creator Track",
      description: "Token-gated content, onchain publishing, monetization.",
      icon: PenTool,
    },
  ],
  whyOnchain: {
    title: "Why Onchain Learning Wins",
    subtitle: "Web3 is the only place where your progress can be:",
    benefits: [
      { title: "Verified", icon: Shield },
      { title: "Portable", icon: Globe },
      { title: "Permanent", icon: Zap },
      { title: "Credible", icon: Target },
      { title: "Composable", icon: Users },
    ],
    comparison: "Traditional education is offchain paperwork. We give users proof-of-experience that anyone can verify.",
  },
  vision: {
    title: "Vision",
    points: [
      "Every new crypto user has a guided path",
      "Every protocol has a structured education journey",
      "Every creator can monetize onchain",
      "Every gamer earns real onchain achievements",
      "Every builder grows through provable skill acquisition",
    ],
  },
  cta: {
    title: "Want to be part of this future?",
    primary: "Start Your Onchain Journey",
    secondary: "Join the Next Cohort",
  },
};


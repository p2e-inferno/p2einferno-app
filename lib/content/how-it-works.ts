import {
  Map,
  Users,
  CheckCircle,
  Trophy,
  TrendingUp,
} from "lucide-react";

export const HOW_IT_WORKS_CONTENT = {
  hero: {
    title: "A Simple, Guided Path Into the Onchain World",
    subtitle: "We make Web3 learning feel like leveling up in a game — not studying a textbook.",
  },
  steps: [
    {
      title: "Pick Your Track",
      description: "Choose from five learning paths based on your goals.",
      icon: Map,
    },
    {
      title: "Join a Bootcamp Cohort",
      description: "Milestone-based, guided, accountable learning.",
      icon: Users,
    },
    {
      title: "Complete Weekly Tasks & Quests",
      description: "Do real onchain actions, not theory.",
      icon: CheckCircle,
    },
    {
      title: "Earn Rewards & Onchain Credentials",
      description: "Every completed milestone = proof-of-experience.",
      icon: Trophy,
    },
    {
      title: "Level Up to the Next Bootcamp or Track",
      description: "A full stack growth journey.",
      icon: TrendingUp,
    },
  ],
  whyItWorks: {
    title: "Why This Works",
    subtitle: "Most people don’t quit Web3 because it’s hard. They quit because:",
    problems: [
      "They don’t know what to do next",
      "They get overwhelmed",
      "They feel alone",
      "They don’t see progress",
      "The learning isn’t structured",
    ],
    solution: "We fix all five.",
  },
  whatYouGet: {
    title: "What You Get",
    items: [
      "Weekly live Q&A",
      "Verified task completion",
      "Easy-to-follow tasks",
      "Community channels",
      "Rewards (DG)",
      "Onchain badges",
      "Real onchain experience",
    ],
  },
  valueEquation: {
    title: "The Psychology Behind It",
    increase: [
      { label: "Dream Outcome", value: "Become onchain fluent" },
      { label: "Likelihood of Achievement", value: "Weekly milestones + coaching" },
    ],
    decrease: [
      { label: "Time Delay", value: "Instant tasks" },
      { label: "Effort & Sacrifice", value: "Clear, step-by-step structure" },
    ],
  },
  cta: {
    primary: "See Bootcamps",
    secondary: "Join the Waitlist",
  },
};


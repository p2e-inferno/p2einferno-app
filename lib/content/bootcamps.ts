import {
  Code,
  Wallet,
  Cpu,
  Gamepad2,
  PenTool,
} from "lucide-react";

export const BOOTCAMPS_CONTENT = {
  hero: {
    title: "Choose Your Path to Onchain Mastery",
    subtitle: "Structured, gamified learning paths that turn beginners into confident onchain users — one cohort at a time.",
    ctaPrimary: "View Bootcamps",
    ctaSecondary: "Join the Waitlist",
  },
  whySection: {
    title: "Why Bootcamps Exist",
    subtitle: "Web3 is confusing. Our bootcamps fix that.",
    problem: "Most people try to learn crypto through random YouTube videos and Twitter threads. Result: overwhelm, confusion, and quitting.",
    solution: "Our bootcamps give you:",
    features: [
      "A clear path",
      "Weekly milestones",
      "Hands-on action steps",
      "Onchain proof-of-completion",
      "Real rewards for learning",
    ],
    transformation: {
      from: "“I don’t know where to start”",
      to: "“I know exactly what to do next.”",
    },
  },
  tracks: [
    {
      title: "Developer Track",
      description: "Become a builder. Learn to create smart contracts, dApps, agents, and automations.",
      icon: Code,
    },
    {
      title: "Blockchain Newcomer Track",
      description: "Learn the fundamentals of Ethereum, wallets, identities, DeFi, NFTs, and onchain coordination.",
      icon: Wallet,
    },
    {
      title: "Frontier-Tech Explorer Track",
      description: "AI agents, automation, advanced L2 systems — explore emerging tech and how to use it.",
      icon: Cpu,
    },
    {
      title: "Gamer Track",
      description: "Explore blockchain-native gaming, tournaments, reward systems, and how gaming meets Ethereum.",
      icon: Gamepad2,
    },
    {
      title: "Creator Track",
      description: "Learn to publish, monetize, and distribute your work onchain using creator tooling.",
      icon: PenTool,
    },
  ],
  upcomingBootcamps: [
    {
      title: "Developer Foundations",
      description: "Smart contracts, testnets, deployments, automations.",
      level: "Intermediate",
      icon: Code,
    },
    {
      title: "Creator Monetization Bootcamp",
      description: "Token-gated communities, NFT sales, publishing tools.",
      level: "All Levels",
      icon: PenTool,
    },
    {
      title: "Ethereum Gaming Bootcamp",
      description: "Onchain tournaments, game integrations, Blockspace economy.",
      level: "All Levels",
      icon: Gamepad2,
    },
    {
      title: "AI + Onchain Agents Bootcamp",
      description: "Automation, agent workflows, L2 execution patterns.",
      level: "Advanced",
      icon: Cpu,
    },
  ],
  includedFeatures: [
    "Weekly live sessions (optional)",
    "Pre-recorded guides & curated resources",
    "Clear milestones + task submissions",
    "Onchain credentials (EAS)",
    "Rewards (DG tokens)",
    "Community access & team groups",
    "Feedback & progress verification",
    "End-of-bootcamp artifact (blog, video, report)",
  ],
  faq: [
    {
      question: "Do I need previous experience?",
      answer: "For the Beginner track, absolutely not. For Developer/Advanced tracks, some coding knowledge is recommended.",
    },
    {
      question: "What if I fall behind?",
      answer: "Our cohorts are designed with catch-up weeks. Plus, you have lifetime access to the materials.",
    },
    {
      question: "Do I need money to do onchain tasks?",
      answer: "Most testnet tasks are free. For mainnet tasks, we often provide small faucet to cover gas costs required for the task (terms and conditions apply) or guide you on low-cost options.",
    },
    {
      question: "How do rewards work?",
      answer: "Complete milestones to earn DG tokens. Top performers in each cohort win additional prizes.",
    },
    {
      question: "What happens after the bootcamp?",
      answer: "You join our alumni network, get access to advanced quests, and can even become a mentor.",
    },
  ],
  finalCta: {
    title: "You don’t need to be technical. You just need a path.",
    buttonText: "Join the Bootcamp Waitlist",
  },
};


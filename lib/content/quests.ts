import {
  Zap,
  Layers,
  PenTool,
  Code,
  Gamepad2,
  Cpu,
} from "lucide-react";

export const QUESTS_CONTENT = {
  hero: {
    title: "Learn by Doing. One Quest at a Time.",
    subtitle: "Short, fun, practical missions that teach you real onchain skills — and reward you for completing them.",
    ctaPrimary: "Browse Quests",
  },
  whySection: {
    title: "Why Quests Exist",
    subtitle: "Most people don’t want a full bootcamp. But they do want:",
    benefits: [
      "Quick wins",
      "Small actions",
      "Real rewards",
      "Fun challenges",
    ],
    description: "Quests give you a low-commitment entry point into the ecosystem. Learn at your own pace, one mission at a time.",
  },
  categories: [
    {
      title: "Beginner Quests",
      description: "Set up wallet, buy ENS, do first cast, mint first NFT.",
      icon: Zap,
    },
    {
      title: "Protocol Quests",
      description: "Uniswap, Aave, Zora, Guild, Snapshot, etc.",
      icon: Layers,
    },
    {
      title: "Creator Quests",
      description: "Mint an artwork, publish onchain, set up a token-gate.",
      icon: PenTool,
    },
    {
      title: "Dev Quests",
      description: "Deploy a test contract, use a node provider, create an automation.",
      icon: Code,
    },
    {
      title: "Gaming Quests",
      description: "Leaderboard missions, game testing, NFT claiming.",
      icon: Gamepad2,
    },
    {
      title: "AI/Frontier Quests",
      description: "AI agents, automations, chain integrations.",
      icon: Cpu,
    },
  ],
  rewards: {
    title: "Rewards System",
    items: [
      "Earn DG Tokens",
      "Level up your profile",
      "Unlock badges",
      "Earn roles in Guild",
      "Access gated channels",
    ],
  },
  questPacks: [
    {
      title: "Beginner Starter Pack",
      description: "Everything you need to go from zero to onchain native.",
    },
    {
      title: "Creator Monetization Pack",
      description: "Launch your first NFT collection and token-gated community.",
    },
    {
      title: "Developer Jumpstart Pack",
      description: "Deploy your first smart contract and build a dApp frontend.",
    },
    {
      title: "Gamer Quest Pack",
      description: "Join tournaments, claim loot, and climb the leaderboards.",
    },
  ],
  finalCta: {
    title: "Pick a quest. Take action. Level up.",
    primary: "Browse Quests",
    secondary: "Create an Account",
  },
};


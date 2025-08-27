import type { BootcampProgram, Cohort } from "./supabase";

// Static data for Infernal Sparks bootcamp
export const infernalSparksProgram: BootcampProgram = {
  id: "infernal-sparks",
  name: "Infernal Sparks",
  description:
    "Beginners entry point to P2E Inferno. Infernal Sparks is a 4-week bootcamp for learning the basics of Ethereum and the P2E Inferno community.",
  duration_weeks: 4,
  max_reward_dgt: 24000, // Total possible DG rewards across all weeks
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Current cohort data
export const currentCohort: Cohort = {
  id: "infernal-sparks-cohort-1",
  bootcamp_program_id: "infernal-sparks",
  name: "Infernal Sparks - Cohort 1",
  start_date: "2024-02-15",
  end_date: "2024-03-15",
  max_participants: 100,
  current_participants: 23,
  registration_deadline: "2024-02-10",
  status: "open",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Week curriculum data
export const weeklyContent = [
  {
    week: 1,
    title: "Foundations - Identity & Web3 Social",
    focus:
      "Understanding wallets, accounts, basic network concepts, establishing a Web3 identity, and engaging in Web3 social platforms.",
    topics: [
      "Ethereum Wallets vs Ethereum Accounts",
      "SIWE (Sign-In with Ethereum)",
      "ENS (Ethereum Name Service)",
      "Web3 Social Concept",
      "Ethereum Testnet vs Mainnet vs Layer 2s",
    ],
    actions: [
      "Set up self-custody wallet",
      "Get a base name",
      "Join Zora marketplace",
      "Post on Zora",
      "Join Farcaster/Warpcast",
      "Make your first cast",
    ],
    reward: 6000,
    estimatedHours: 8,
  },
  {
    week: 2,
    title: "Interactions - DeFi & Governance Basics",
    focus:
      "Interacting with decentralized protocols, performing token swaps, and understanding how decentralized governance works.",
    topics: [
      "Miner vs Validator basics",
      "DAO (Decentralized Autonomous Organization)",
      "Delegation concepts",
      "DAO Treasury management",
      "Governor vs Timelock contracts",
    ],
    actions: [
      "Perform token swap on testnet",
      "Join Unlock DAO Discord",
      "Introduce yourself in community",
    ],
    reward: 6000,
    estimatedHours: 8,
  },
  {
    week: 3,
    title: "Exploration - NFTs & Community Tooling",
    focus:
      "Understanding the role of NFTs in Web3 communities and exploring tools that empower decentralized communities.",
    topics: [
      "Token-gating and access control",
      "Public goods funding",
      "Tally, Snapshot, Gitcoin Grants",
      "Community coordination platforms",
    ],
    actions: [
      "Join P2E Inferno Guild on Guild.xyz",
      "Claim a role in the guild",
      "Participate in Farcaster poll",
    ],
    reward: 6000,
    estimatedHours: 8,
  },
  {
    week: 4,
    title: "Reflection & Reporting",
    focus:
      "Consolidating your journey, reflecting on what you've learned, and creating a proof-of-experience artifact.",
    topics: [
      "Journey documentation",
      "Web3 identity verification",
      "Portfolio creation",
      "Community showcase",
    ],
    actions: [
      "Create learning artifact (blog/video/report)",
      "Register Gitcoin Passport (bonus)",
      "Achieve Passport Score 20+ (bonus)",
    ],
    reward: 7000,
    bonusReward: 5000,
    estimatedHours: 8,
  },
];

export function formatCurrency(
  amount: number,
  currency: "NGN" | "USD"
): string {
  if (currency === "NGN") {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
    }).format(amount);
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

import {
  BookOpen,
  Users,
  Trophy,
  Ticket,
  Briefcase,
  Network,
  LucideIcon,
} from "lucide-react";

export type ServiceStep = {
  title: string;
  description: string;
};

export type ServiceContent = {
  slug: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  ctaPrimary: string;
  ctaLink: string;
  problem: {
    title: string;
    points: string[];
  };
  solution: {
    title: string;
    points: string[];
  };
  outcomes?: string[];
  deliverables: string[];
};

// Booking link for calls
const BOOKING_LINK = "https://meetwith.xyz/address/0xdfe26b299c80a3742e1a3571a629f8279fe7b22c"; 

export const SERVICES_OVERVIEW = {
  title: "Onboard, Educate, and Activate Your Community Onchain",
  subtitle: "Six services designed to turn confused users into confident onchain participants.",
  ctaPrimary: "Book a Discovery Call",
  ctaSecondary: "View Our Services",
  whySection: {
    title: "Why These Services Exist",
    problem: "Web3 protocols, DAOs, founders, and creators all share one problem: Your users don’t know what to do next.",
    description: "They get lost during onboarding, confused by mechanics, or stuck with zero guidance. We fix that by giving you proven educational systems, structured onboarding, gamified engagement, and tools to drive participation.",
    tagline: "We’re not here to “inform.” We’re here to transform.",
  },
  targetAudience: [
    "Protocol teams",
    "DAOs",
    "Creator collectives",
    "Startups",
    "Gaming projects",
    "Communities needing structure & engagement",
  ],
  process: [
    {
      title: "Step 1 — Discovery",
      description: "We diagnose: traffic, offer, onboarding, retention.",
    },
    {
      title: "Step 2 — Strategy",
      description: "We build your onboarding, education, or engagement engine.",
    },
    {
      title: "Step 3 — Deployment",
      description: "We run workshops, quests, activations, bootcamps.",
    },
    {
      title: "Step 4 — Optimization",
      description: "We iterate based on your community’s onchain behavior.",
    },
  ],
  proofMetrics: [
    "Wallet activations",
    "Onchain transactions",
    "Content creation",
    "Social activity",
    "Governance participation",
    "Community retention",
    "Event engagement",
  ],
};

export const ALL_SERVICES: ServiceContent[] = [
  {
    slug: "education",
    title: "Education That Turns Beginners Into Confident Onchain Users",
    subtitle: "Hands-on workshops, structured bootcamps, and guided learning experiences.",
    icon: BookOpen,
    ctaPrimary: "Book an Education Strategy Call",
    ctaLink: BOOKING_LINK,
    problem: {
      title: "Most Web3 education is:",
      points: [
        "Unstructured",
        "Shallow",
        "Overwhelming",
        "Non-actionable",
        "Confusing",
        "Leads to drop-off rates over 80%",
      ],
    },
    solution: {
      title: "We provide:",
      points: [
        "Workshop series",
        "Cohort-based bootcamps",
        "On-demand learning modules",
        "Quest-based learning tracks",
        "Creator/Developer/Gaming Learning Paths",
        "Content built on doing, not reading",
      ],
    },
    outcomes: [
      "Higher user retention",
      "Increased onchain activity",
      "Deeper protocol understanding",
      "Users who KNOW what to do next",
      "More governance participation",
      "Stronger community trust",
    ],
    deliverables: [
      "Custom curriculum",
      "Milestone-based learning",
      "Quests & challenges",
      "Knowledge assessments",
      "EAS onchain credentials",
      "Integration with your community tools",
    ],
  },
  {
    slug: "onboarding-mentoring",
    title: "Done-With-You Onboarding for Web3 Users & Communities",
    subtitle: "Step-by-step guidance that removes confusion and accelerates adoption.",
    icon: Users,
    ctaPrimary: "Book an Onboarding Consultation",
    ctaLink: BOOKING_LINK,
    problem: {
      title: "Web3 onboarding breaks because:",
      points: [
        "Users feel lost",
        "Wallet setup is confusing",
        "Protocols assume too much knowledge",
        "Teams have no structured onboarding flow",
      ],
    },
    solution: {
      title: "We give your users:",
      points: [
        "Personal mentoring",
        "Orientation sessions",
        "Beginner-to-advanced onboarding flows",
        "Clear first steps",
        "Templates, guides, and walkthroughs",
      ],
    },
    outcomes: [
      "Users actually follow through",
      "Confusion disappears",
      "Community activation goes up",
      "More users reach “aha moments”",
    ],
    deliverables: [
      "Guided wallet setup",
      "ENS, identity & profile setup",
      "First onchain transactions",
      "Platform/tool walkthroughs",
      "Personalized check-ins",
    ],
  },
  {
    slug: "events",
    title: "Onchain Events That Actually Drive Engagement",
    subtitle: "Tournaments, quests, hackathons, activations, and reward-driven social experiences.",
    icon: Trophy,
    ctaPrimary: "Book an Event Planning Call",
    ctaLink: BOOKING_LINK,
    problem: {
      title: "Most Web3 events feel like:",
      points: [
        "Lectures",
        "Corporate panels",
        "Boring Discord calls",
        "Result: no retention",
      ],
    },
    solution: {
      title: "We create activation-focused events:",
      points: [
        "Onchain tournaments",
        "Web3 gaming competitions",
        "Quest-based community challenges",
        "Learning weeks",
        "Hackathons",
        "Livestream quests",
        "Creator showcases",
        "Treasure hunts & reward experiences",
      ],
    },
    outcomes: [
      "Higher retention",
      "More active users",
      "Real proof-of-work",
      "Increased wallet actions",
      "Social buzz",
    ],
    deliverables: [
      "Event design",
      "Reward mechanics",
      "NFT ticketing",
      "Leaderboards",
      "Onchain achievement systems",
      "Real-time analytics",
    ],
  },
  {
    slug: "nft-ticketing",
    title: "Turn Events Into Digital Collectible Experiences",
    subtitle: "Sell access, unlock community perks, and track user engagement onchain.",
    icon: Ticket,
    ctaPrimary: "Book a Ticketing Demo",
    ctaLink: BOOKING_LINK,
    problem: {
      title: "Web2 ticketing gives you:",
      points: [
        "No ownership",
        "No analytics",
        "No composability",
        "No reward loops",
      ],
    },
    solution: {
      title: "We use Unlock Protocol and similar tooling to create:",
      points: [
        "NFT event tickets",
        "Membership passes",
        "Creator-gated experiences",
        "Multi-tiered VIP passes",
        "Rewardable access",
      ],
    },
    outcomes: [
      "You own your audience",
      "Fans get something collectible",
      "Easier reward systems",
      "Longer retention",
      "More repeat attendees",
    ],
    deliverables: [
      "Ticket creation & deployment",
      "Redemption flows",
      "Access gating integration",
      "Perks & reward system",
      "Event analytics",
    ],
  },
  {
    slug: "consulting",
    title: "Expert Guidance on Ethereum, AI, Automation & Community Strategy",
    subtitle: "We help you design systems that scale — not hype.",
    icon: Briefcase,
    ctaPrimary: "Book a Strategy Call",
    ctaLink: BOOKING_LINK,
    problem: {
      title: "Teams struggle with:",
      points: [
        "Onboarding",
        "Retention",
        "Activation",
        "Community systems",
        "Unclear roadmaps",
        "Bad incentives",
        "Low participation",
      ],
    },
    solution: {
      title: "We analyze your ecosystem and provide:",
      points: [
        "Activation strategy",
        "User journey mapping",
        "Bootcamp or quest design",
        "Tokenized reward loops",
        "Community management systems",
        "Governance participation frameworks",
        "Creator monetization infrastructure",
      ],
    },
    outcomes: [
        "Clear Roadmap",
        "Improved Retention",
        "Better Incentives",
    ],
    deliverables: [
      "Audit",
      "Roadmap",
      "System design",
      "Implementation support",
      "Templates & playbooks",
    ],
  },
  {
    slug: "community-building",
    title: "Build a Thriving Onchain Community That Grows Itself",
    subtitle: "We help you create systems that attract, retain, and empower your users.",
    icon: Network,
    ctaPrimary: "Book a Community Strategy Call",
    ctaLink: BOOKING_LINK,
    problem: {
      title: "Communities fail because:",
      points: [
        "No engagement loop",
        "Unclear incentives",
        "Poor onboarding",
        "No education path",
        "Nothing to do",
        "No structure",
        "No progression",
      ],
    },
    solution: {
      title: "We build:",
      points: [
        "Community journeys",
        "Reward mechanisms",
        "Progression systems",
        "Social engagement loops",
        "Quest systems",
        "Contributor pipelines",
        "DAO participation structures",
      ],
    },
    outcomes: [
      "Active community",
      "Strong culture",
      "High participation",
      "Sustainable growth",
    ],
    deliverables: [
      "Discord/Guild setup",
      "Onchain achievement systems",
      "Quest series",
      "Progression trees",
      "Governance flow",
      "Community team training",
    ],
  },
];


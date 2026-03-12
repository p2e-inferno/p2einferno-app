import type { ServerChatRouteProfile } from "@/lib/chat/server/respond-types";

const SERVER_CHAT_ROUTE_PROFILES: Record<
  ServerChatRouteProfile["id"],
  ServerChatRouteProfile
> = {
  home_sales: {
    id: "home_sales",
    audience: ["sales"],
    domainTags: ["business", "positioning", "marketing", "bootcamp", "quest"],
    retrievalLimit: 5,
    freshnessDays: 45,
    maxTokens: 450,
    assistantObjective:
      "Explain P2E Inferno clearly, qualify fit, and guide visitors toward getting started.",
    responseStyle: "Benefit-led, concise, and conversion-oriented.",
    weakRetrievalMode: "sales",
    weakRetrievalReply:
      "I don't have enough grounded product detail for that specific operational question right now.\n\n" +
      "At a high level, P2E Inferno helps people learn frontier tech through guided bootcamps, quests, and progression systems.\n\n" +
      "If you want to get started, the best path is to create an account, explore the lobby, and choose between quests or bootcamps based on whether you want quick action or structured learning.",
  },
  general_support: {
    id: "general_support",
    audience: ["support"],
    domainTags: ["navigation", "ui", "platform", "getting-started"],
    retrievalLimit: 5,
    freshnessDays: 21,
    maxTokens: 500,
    assistantObjective:
      "Help authenticated users navigate operational parts of the app safely when they are outside the main lobby routes.",
    responseStyle: "Neutral, support-safe, and operational.",
    weakRetrievalMode: "support",
    weakRetrievalReply:
      "I can't confirm that specific app detail from the knowledge I retrieved.\n\n" +
      "Safest next steps:\n" +
      "1. Check the current page state and any visible prompts or status text\n" +
      "2. If this relates to account access, wallet state, or progression, compare it with the relevant lobby section\n" +
      "3. Share the exact page or message you see and I'll narrow the next safe step",
  },
  lobby_support: {
    id: "lobby_support",
    audience: ["support"],
    domainTags: [
      "onboarding",
      "lobby",
      "navigation",
      "wallet",
      "membership",
      "quests",
      "bootcamps",
      "progression",
    ],
    retrievalLimit: 6,
    freshnessDays: 14,
    maxTokens: 525,
    assistantObjective:
      "Help authenticated users orient themselves, get unstuck, and find the next valid action in the app.",
    responseStyle: "Operational, step-based, and not marketing-heavy.",
    weakRetrievalMode: "support",
    weakRetrievalReply:
      "I can't confirm that operational detail from the knowledge I retrieved.\n\n" +
      "Safest next steps:\n" +
      "1. Use the lobby to identify the area you're working in\n" +
      "2. Check whether the issue is about wallet access, membership, quests, bootcamps, or vendor flows\n" +
      "3. Share the exact page or message you see and I'll guide you from there",
  },
  quest_support: {
    id: "quest_support",
    audience: ["support"],
    domainTags: [
      "quest",
      "catalog",
      "tasks",
      "daily-quest",
      "progression",
      "rewards",
    ],
    retrievalLimit: 7,
    freshnessDays: 7,
    maxTokens: 525,
    assistantObjective:
      "Help users navigate quests, task requirements, and progression blockers.",
    responseStyle: "Specific, task-oriented, and route-aware.",
    weakRetrievalMode: "support",
    weakRetrievalReply:
      "I can't confirm that quest detail from the knowledge I retrieved.\n\n" +
      "Safest next steps:\n" +
      "1. Open the relevant quest in `/lobby/quests`\n" +
      "2. Check the task requirements and any visible eligibility or verification prompts\n" +
      "3. If something is blocked, share the exact status or error text and I'll help interpret it",
  },
  bootcamp_support: {
    id: "bootcamp_support",
    audience: ["support"],
    domainTags: [
      "bootcamp",
      "cohort",
      "registration",
      "enrollment",
      "milestone",
      "tasks",
      "payments",
    ],
    retrievalLimit: 7,
    freshnessDays: 7,
    maxTokens: 550,
    assistantObjective:
      "Help users with bootcamp enrollment, cohort navigation, milestones, and application/payment continuity.",
    responseStyle: "Operational and precise.",
    weakRetrievalMode: "support",
    weakRetrievalReply:
      "I can't confirm that bootcamp or application detail from the knowledge I retrieved.\n\n" +
      "Safest next steps:\n" +
      "1. Check the current application or cohort state from the lobby\n" +
      "2. If payment or enrollment is involved, confirm whether the issue is before payment, after payment, or inside the enrolled cohort view\n" +
      "3. Share the exact state you see and I'll help narrow the next step",
  },
  vendor_support: {
    id: "vendor_support",
    audience: ["support"],
    domainTags: [
      "vendor",
      "dg-token-vendor",
      "progression",
      "renewal",
      "pullout",
      "membership",
    ],
    retrievalLimit: 7,
    freshnessDays: 14,
    maxTokens: 550,
    assistantObjective:
      "Help users understand vendor progression, renewal, membership, and pullout flows without guessing account state.",
    responseStyle: "Operational and support-safe.",
    weakRetrievalMode: "support",
    weakRetrievalReply:
      "I can't confirm the exact vendor detail from the knowledge I retrieved.\n\n" +
      "Safest next steps:\n" +
      "1. Review the current state on `/lobby/vendor`\n" +
      "2. Check whether your question is about progression, renewal, or pullout\n" +
      "3. If you're blocked by membership or wallet context, verify the active wallet in `/lobby/profile`\n\n" +
      "If you tell me the exact vendor action or error you see, I can narrow the guidance.",
  },
};

const SALES_ROUTE_PREFIXES = [
  "/",
  "/bootcamps",
  "/quests",
  "/gooddollar-verification",
];

export function normalizeChatRoutePathname(
  pathnameInput: string | null | undefined,
) {
  const raw = (pathnameInput || "/").trim();
  const withoutFragment = raw.split("#", 1)[0] || "/";
  const withoutQuery = withoutFragment.split("?", 1)[0] || "/";
  const prefixed = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  const collapsed = prefixed.replace(/\/{2,}/g, "/");
  const normalized =
    collapsed.length > 1 && collapsed.endsWith("/")
      ? collapsed.slice(0, -1)
      : collapsed;

  return normalized || "/";
}

export function resolveServerChatRouteProfile(
  pathnameInput: string | null | undefined,
  options: { isAuthenticated: boolean } = { isAuthenticated: false },
) {
  const pathname = normalizeChatRoutePathname(pathnameInput);

  if (pathname.startsWith("/lobby/vendor")) {
    return SERVER_CHAT_ROUTE_PROFILES.vendor_support;
  }

  if (
    pathname.startsWith("/lobby/bootcamps") ||
    pathname.startsWith("/lobby/apply")
  ) {
    return SERVER_CHAT_ROUTE_PROFILES.bootcamp_support;
  }

  if (pathname.startsWith("/lobby/quests")) {
    return SERVER_CHAT_ROUTE_PROFILES.quest_support;
  }

  if (pathname.startsWith("/lobby")) {
    return SERVER_CHAT_ROUTE_PROFILES.lobby_support;
  }

  if (
    options.isAuthenticated &&
    pathname !== "/" &&
    !SALES_ROUTE_PREFIXES.some((prefix) =>
      prefix === "/" ? false : pathname.startsWith(prefix),
    )
  ) {
    return SERVER_CHAT_ROUTE_PROFILES.general_support;
  }

  return SERVER_CHAT_ROUTE_PROFILES.home_sales;
}

export function getServerChatRouteProfiles() {
  return Object.values(SERVER_CHAT_ROUTE_PROFILES);
}

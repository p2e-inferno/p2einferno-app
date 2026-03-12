import type {
  ChatAssistantContext,
  ChatAssistantMode,
  ChatRouteBehavior,
} from "@/lib/chat/types";

const ROUTE_BEHAVIOR_MAP: Record<ChatAssistantMode, ChatRouteBehavior> = {
  general: {
    key: "general",
    assistantLabel: "General guide",
    systemHint:
      "Help users orient themselves and find the next useful step in the app.",
  },
  quests: {
    key: "quests",
    assistantLabel: "Quest guide",
    systemHint:
      "Bias toward explaining quests, task progress, and reward-related flows.",
  },
  bootcamp: {
    key: "bootcamp",
    assistantLabel: "Bootcamp guide",
    systemHint:
      "Bias toward enrollment, cohort structure, milestones, and completion guidance.",
  },
  application: {
    key: "application",
    assistantLabel: "Application guide",
    systemHint:
      "Bias toward application steps, requirements, and submission readiness.",
  },
  dashboard: {
    key: "dashboard",
    assistantLabel: "Dashboard guide",
    systemHint:
      "Bias toward account state, navigation, and ongoing user progress.",
  },
  admin: {
    key: "admin",
    assistantLabel: "Admin guide",
    systemHint:
      "Keep responses operational and scoped to admin workflows and controls.",
  },
};

const ROUTE_STARTER_PROMPTS: Record<ChatAssistantMode, string> = {
  general: "I can help you find the next useful step anywhere in the app.",
  quests:
    "I can help you pick a quest, understand task progress, and navigate rewards.",
  bootcamp:
    "I can help you understand cohorts, milestones, and completion steps here.",
  application:
    "I can help you understand requirements and prepare this application flow.",
  dashboard:
    "I can help you interpret account state and ongoing progress from this area.",
  admin:
    "I can help you with the admin workflow and the controls available on this route.",
};

export function resolveChatRouteBehavior(
  pathname: string,
  segment: string | null,
): ChatRouteBehavior {
  if (pathname.startsWith("/admin")) {
    return ROUTE_BEHAVIOR_MAP.admin;
  }

  switch (segment) {
    case "quests":
      return ROUTE_BEHAVIOR_MAP.quests;
    case "bootcamp":
    case "bootcamps":
      return ROUTE_BEHAVIOR_MAP.bootcamp;
    case "apply":
      return ROUTE_BEHAVIOR_MAP.application;
    case "dashboard":
    case "lobby":
      return ROUTE_BEHAVIOR_MAP.dashboard;
    default:
      return ROUTE_BEHAVIOR_MAP.general;
  }
}

export function buildChatAssistantContext(
  behavior: ChatRouteBehavior,
): ChatAssistantContext {
  return {
    mode: behavior.key,
    systemHint: behavior.systemHint,
    starterPrompt: ROUTE_STARTER_PROMPTS[behavior.key],
  };
}

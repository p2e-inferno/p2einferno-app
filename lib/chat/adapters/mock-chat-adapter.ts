import type { ChatAdapter } from "@/lib/chat/adapters/chat-adapter";
import type { ChatAdapterRequest } from "@/lib/chat/types";
import { createAssistantMessage } from "@/lib/chat/utils";

export function getMockAssistantReply(input: ChatAdapterRequest): string {
  const { message, assistantContext } = input;
  const userText = message.content;
  const t = userText.toLowerCase();

  if (t.includes("first") || t.includes("start") || t.includes("do here")) {
    return (
      `Welcome 👋\n\n${assistantContext.starterPrompt}\n\n` +
      "Here’s a clean way to start:\n" +
      "1) Create an account\n" +
      "2) Complete the first onboarding quest\n" +
      "3) Connect your wallet (optional but recommended)\n" +
      "4) Pick a track/quest and follow the checklist\n\n" +
      "Tell me what you’re trying to achieve and I’ll guide you."
    );
  }

  if (t.includes("wallet") || t.includes("connect")) {
    return (
      "Wallet setup (quick):\n" +
      "• Click **Connect Wallet**\n" +
      "• Choose your wallet (e.g., MetaMask)\n" +
      "• Approve the connection\n" +
      "• Confirm your address shows as connected\n\n" +
      "If you share what wallet you’re using, I’ll tailor the steps."
    );
  }

  if (t.includes("earn") || t.includes("rewards") || t.includes("token")) {
    return (
      "You earn by completing quests/tasks. Usually it’s:\n" +
      "• Do the task\n" +
      "• Submit proof (or it auto-verifies)\n" +
      "• Get points/rewards\n\n" +
      "Want me to recommend a ‘first win in 10 minutes’ quest?"
    );
  }

  if (
    t.includes("verify") ||
    t.includes("verification") ||
    t.includes("identity")
  ) {
    return (
      "Verification helps prevent bots and makes rewards fair.\n\n" +
      "Typically you’ll:\n" +
      "• Start verification\n" +
      "• Complete the steps in-app\n" +
      "• Get a verified badge\n\n" +
      "If verification fails, tell me the exact error message and I’ll help fix it."
    );
  }

  return (
    `Got you.\n\n${assistantContext.starterPrompt}\n\n` +
    "Tell me one thing: are you here to **learn**, **earn**, or **build**? I’ll point you to the right first step."
  );
}

export class MockChatAdapter implements ChatAdapter {
  async reply(input: ChatAdapterRequest) {
    await new Promise((resolve) => setTimeout(resolve, 650));

    return {
      mode: "final" as const,
      message: createAssistantMessage(getMockAssistantReply(input)),
    };
  }
}

export const mockChatAdapter = new MockChatAdapter();

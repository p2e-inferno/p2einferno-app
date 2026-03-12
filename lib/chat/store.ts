import { create } from "zustand";
import { CHAT_WELCOME_MESSAGE } from "@/lib/chat/constants";
import type {
  ChatAuthContext,
  ChatMessage,
  ChatRouteContext,
  ChatWidgetSession,
  ChatWidgetState,
  RestoreConversationResult,
} from "@/lib/chat/types";

const initialAuth: ChatAuthContext = {
  isReady: false,
  isAuthenticated: false,
  privyUserId: null,
  walletAddress: null,
};

const initialState: ChatWidgetState = {
  isOpen: false,
  isPeekVisible: false,
  isPeekDismissed: false,
  draft: "",
  activeConversationId: null,
  messages: [CHAT_WELCOME_MESSAGE],
  status: "idle",
  error: null,
  auth: initialAuth,
  route: null,
  hasHydrated: false,
  lastHydratedUserId: null,
};

interface ChatStoreActions {
  openWidget: () => void;
  closeWidget: () => void;
  setPeekVisible: (visible: boolean) => void;
  dismissPeek: () => void;
  setDraft: (draft: string) => void;
  setStatus: (status: ChatWidgetState["status"]) => void;
  setError: (error: string | null) => void;
  setAuth: (auth: ChatAuthContext) => void;
  setRoute: (route: ChatRouteContext) => void;
  setMessages: (messages: ChatMessage[]) => void;
  appendMessages: (messages: ChatMessage[]) => void;
  setActiveConversationId: (conversationId: string | null) => void;
  applyRestore: (payload: RestoreConversationResult, userId: string | null) => void;
  resetConversation: () => void;
  markHydrated: (userId: string | null) => void;
  getWidgetSession: () => ChatWidgetSession;
}

export const useChatStore = create<ChatWidgetState & ChatStoreActions>((set, get) => ({
  ...initialState,
  openWidget: () =>
    set({
      isOpen: true,
      isPeekVisible: false,
      error: null,
    }),
  closeWidget: () => set({ isOpen: false }),
  setPeekVisible: (visible) => set({ isPeekVisible: visible }),
  dismissPeek: () => set({ isPeekDismissed: true, isPeekVisible: false }),
  setDraft: (draft) => set({ draft }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error }),
  setAuth: (auth) => set({ auth }),
  setRoute: (route) => set({ route }),
  setMessages: (messages) => set({ messages }),
  appendMessages: (messages) =>
    set((state) => ({ messages: [...state.messages, ...messages] })),
  setActiveConversationId: (activeConversationId) => set({ activeConversationId }),
  applyRestore: (payload, userId) =>
    set((state) => ({
      activeConversationId: payload.conversation?.id ?? state.activeConversationId,
      messages: payload.conversation?.messages?.length
        ? payload.conversation.messages
        : [CHAT_WELCOME_MESSAGE],
      isOpen: payload.widget?.isOpen ?? state.isOpen,
      isPeekVisible:
        payload.widget?.isPeekVisible ??
        (!state.isPeekDismissed && state.isPeekVisible),
      isPeekDismissed: payload.widget?.isPeekDismissed ?? state.isPeekDismissed,
      draft: payload.widget?.draft ?? "",
      hasHydrated: true,
      lastHydratedUserId: userId,
      error: null,
    })),
  resetConversation: () =>
    set({
      activeConversationId: null,
      messages: [CHAT_WELCOME_MESSAGE],
      draft: "",
      status: "idle",
      error: null,
    }),
  markHydrated: (userId) => set({ hasHydrated: true, lastHydratedUserId: userId }),
  getWidgetSession: () => {
    const state = get();
    return {
      isOpen: state.isOpen,
      isPeekVisible: state.isPeekVisible,
      isPeekDismissed: state.isPeekDismissed,
      draft: state.draft,
    };
  },
}));

export function getChatStoreState() {
  return useChatStore.getState();
}

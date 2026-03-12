export type ChatRole = "user" | "assistant";

export type ChatRequestStatus = "idle" | "hydrating" | "sending" | "error";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  ts: number;
}

export interface SuggestedPrompt {
  label: string;
  prompt: string;
}

export interface ChatConversation {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  source: "anonymous" | "authenticated";
}

export interface ChatRouteContext {
  pathname: string;
  routeKey: string;
  pageLabel: string;
  segment: string | null;
}

export interface ChatAuthContext {
  isReady: boolean;
  isAuthenticated: boolean;
  privyUserId: string | null;
  walletAddress: string | null;
}

export interface ChatWidgetSession {
  isOpen: boolean;
  isPeekVisible: boolean;
  isPeekDismissed: boolean;
  draft: string;
}

export interface RestoreConversationResult {
  conversation: ChatConversation | null;
  widget: ChatWidgetSession | null;
}

export interface ChatWidgetState extends ChatWidgetSession {
  activeConversationId: string | null;
  messages: ChatMessage[];
  status: ChatRequestStatus;
  error: string | null;
  auth: ChatAuthContext;
  route: ChatRouteContext | null;
  hasHydrated: boolean;
  lastHydratedUserId: string | null;
}

export interface ChatAdapterRequest {
  conversationId: string;
  message: ChatMessage;
  messages: ChatMessage[];
  auth: ChatAuthContext;
  route: ChatRouteContext | null;
}

export interface ChatSourceReference {
  id: string;
  title: string;
  href?: string;
}

export interface ChatAdapterResponse {
  message: ChatMessage;
  sources?: ChatSourceReference[];
}

export interface ChatControllerBootstrapOptions {
  auth: ChatAuthContext;
  route: ChatRouteContext;
}

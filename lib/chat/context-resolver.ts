import { resolveChatRouteBehavior } from "@/lib/chat/route-behavior";
import type { ChatRouteContext } from "@/lib/chat/types";

function toTitleCase(value: string) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveChatRouteContext(pathnameInput: string | undefined): ChatRouteContext {
  const pathname = pathnameInput || "/";
  const parts = pathname.split("/").filter(Boolean);
  const segment = parts[0] ?? null;
  const routeKey = parts.join(":") || "home";
  const pageLabel = segment ? toTitleCase(segment) : "Home";
  const behavior = resolveChatRouteBehavior(pathname, segment);

  return {
    pathname,
    routeKey,
    pageLabel,
    segment,
    behavior,
  };
}

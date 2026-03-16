"use client";

import * as React from "react";
import { useRouter } from "next/router";
import {
  CHAT_TEASER_HIDE_DELAY_MS,
  CHAT_TEASER_SHOW_DELAY_MS,
} from "@/lib/chat/constants";
import { resolveChatRouteContext } from "@/lib/chat/context-resolver";
import { chatController } from "@/lib/chat/controller";
import { useChatStore } from "@/lib/chat/store";
import { useChatAuthSession } from "@/hooks/chat/use-chat-auth-session";

export function useChatBootstrap() {
  const router = useRouter();
  const { auth, resolveAccessToken } = useChatAuthSession();
  const authState = useChatStore((state) => state.auth);
  const isPeekDismissed = useChatStore((state) => state.isPeekDismissed);
  const isOpen = useChatStore((state) => state.isOpen);
  const setPeekVisible = useChatStore((state) => state.setPeekVisible);

  const route = React.useMemo(
    () => resolveChatRouteContext(router.pathname),
    [router.pathname],
  );

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const accessToken = await resolveAccessToken();

      if (cancelled) {
        return;
      }

      await chatController.bootstrap({
        auth,
        route,
        accessToken,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, resolveAccessToken, route]);

  React.useEffect(() => {
    if (!authState.isReady || isPeekDismissed || isOpen) {
      return;
    }

    const showTimer = window.setTimeout(
      () => setPeekVisible(true),
      CHAT_TEASER_SHOW_DELAY_MS,
    );
    const hideTimer = window.setTimeout(
      () => setPeekVisible(false),
      CHAT_TEASER_HIDE_DELAY_MS,
    );

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [authState.isReady, isOpen, isPeekDismissed, setPeekVisible]);
}

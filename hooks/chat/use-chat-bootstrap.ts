"use client";

import * as React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/router";
import {
  CHAT_TEASER_HIDE_DELAY_MS,
  CHAT_TEASER_SHOW_DELAY_MS,
} from "@/lib/chat/constants";
import { resolveChatRouteContext } from "@/lib/chat/context-resolver";
import { chatController } from "@/lib/chat/controller";
import { useChatStore } from "@/lib/chat/store";

export function useChatBootstrap() {
  const router = useRouter();
  const { user, authenticated, ready } = usePrivy();
  const auth = useChatStore((state) => state.auth);
  const isPeekDismissed = useChatStore((state) => state.isPeekDismissed);
  const isOpen = useChatStore((state) => state.isOpen);
  const setPeekVisible = useChatStore((state) => state.setPeekVisible);

  const route = React.useMemo(
    () => resolveChatRouteContext(router.pathname),
    [router.pathname],
  );

  React.useEffect(() => {
    const walletAddress = user?.wallet?.address ?? null;
    const privyUserId = user?.id ?? null;

    void chatController.bootstrap({
      auth: {
        isReady: ready,
        isAuthenticated: authenticated,
        privyUserId,
        walletAddress,
      },
      route,
    });
  }, [authenticated, ready, route, user?.id, user?.wallet?.address]);

  React.useEffect(() => {
    if (!auth.isReady || isPeekDismissed || isOpen) {
      return;
    }

    const showTimer = window.setTimeout(() => setPeekVisible(true), CHAT_TEASER_SHOW_DELAY_MS);
    const hideTimer = window.setTimeout(() => setPeekVisible(false), CHAT_TEASER_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [auth.isReady, isOpen, isPeekDismissed, setPeekVisible]);
}

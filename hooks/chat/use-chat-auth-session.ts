"use client";

import * as React from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { ChatAuthContext } from "@/lib/chat/types";

export function useChatAuthSession() {
  const { user, authenticated, ready, getAccessToken } = usePrivy();

  const auth = React.useMemo<ChatAuthContext>(
    () => ({
      isReady: ready,
      isAuthenticated: authenticated,
      privyUserId: user?.id ?? null,
      walletAddress: user?.wallet?.address ?? null,
    }),
    [authenticated, ready, user?.id, user?.wallet?.address],
  );

  const resolveAccessToken = React.useCallback(async () => {
    if (!ready || !authenticated) {
      return null;
    }

    return getAccessToken().catch(() => null);
  }, [authenticated, getAccessToken, ready]);

  return {
    auth,
    resolveAccessToken,
  };
}

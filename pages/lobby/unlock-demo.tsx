import React from "react";
import { LobbyLayout } from "../../components/layouts/lobby-layout";
import { UnlockUtilsDemo } from "../../components/unlock/UnlockUtilsDemo";

/**
 * Demo page for testing the new Unlock Protocol integration
 * Route: /lobby/unlock-demo
 */
export default function UnlockDemoPage() {
  return (
    <LobbyLayout>
      <div className="container mx-auto px-4 py-8">
        <UnlockUtilsDemo />
      </div>
    </LobbyLayout>
  );
}

import { PrivyProvider } from "@privy-io/react-auth";
import React, { useEffect } from "react";
import { AdminAuthProvider } from "@/contexts/admin-context";

// This component is a workaround for a common issue with scrollbars in server-rendered
// applications that have different content lengths on server and client. It ensures
// the scrollbar is handled gracefully when Privy's modals open and close.
const ScrollbarFix = () => {
  useEffect(() => {
    // This is a simple fix. A more complex one might observe DOM mutations
    // if this proves insufficient with Privy's modals.
    document.documentElement.style.overflow = "auto";
  }, []);
  return null;
};

// This wrapper now contains the PrivyProvider and is only ever rendered on the client side.
// This is the key to preventing SSR-related errors from libraries that expect a window object.
export interface ClientSideWrapperProps {
  children: React.ReactNode;
  isAdminRoute?: boolean;
}

function ClientSideWrapper({
  children,
  isAdminRoute = false,
}: ClientSideWrapperProps) {
  const content = isAdminRoute ? (
    <AdminAuthProvider>{children}</AdminAuthProvider>
  ) : (
    children
  );

  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      clientId={process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || ""}
      config={{
        // Wallets configuration
        embeddedWallets: {
          createOnLogin: "all-users",
        },
        // UI configuration
        appearance: {
          theme: "dark",
          accentColor: "#FFD700", // A yellow/gold to match the theme
        },
        // Login methods
        loginMethods: ["email", "wallet", "farcaster"],
        // This is crucial to prevent "Metamask not found" errors on SSR
        defaultChain: undefined,
      }}
    >
      <ScrollbarFix />
      {content}
    </PrivyProvider>
  );
}

export default ClientSideWrapper;

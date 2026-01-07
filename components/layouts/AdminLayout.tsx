import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useAdminAuthContext } from "@/contexts/admin-context";
import AdminAccessRequired from "@/components/admin/AdminAccessRequired";
import AdminSessionRequired from "@/components/admin/AdminSessionRequired";
import { PrivyConnectButton } from "@/components/PrivyConnectButton";
import {
  Menu,
  X,
  HomeIcon,
  BookOpen,
  Users,
  Award,
  FileText,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Zap,
  ShieldAlert,
} from "lucide-react";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:AdminLayout");

interface AdminLayoutProps {
  children: React.ReactNode;
  requiresSession?: boolean; // Allow disabling session requirement for specific pages
}

const adminNavItems = [
  { name: "Dashboard", href: "/admin", icon: HomeIcon },
  { name: "Cohorts", href: "/admin/cohorts", icon: Users },
  { name: "Bootcamps", href: "/admin/bootcamps", icon: BookOpen },
  { name: "Quests", href: "/admin/quests", icon: Award },
  { name: "Payments", href: "/admin/payments", icon: CreditCard },
  { name: "DG Pullouts", href: "/admin/dg-pullouts", icon: DollarSign },
  {
    name: "Subscription Config",
    href: "/admin/subscriptions/config",
    icon: Zap,
  },
  { name: "CSP Reports", href: "/admin/csp-reports", icon: ShieldAlert },
  { name: "Applications", href: "/admin/applications", icon: FileText },
  { name: "Draft Recovery", href: "/admin/draft-recovery", icon: FileText },
];

export default function AdminLayout({
  children,
  requiresSession = true,
}: AdminLayoutProps) {
  const {
    authStatus,
    authenticated,
    user,
    walletAddress,
    isAdmin,
    hasValidSession,
    isLoadingAuth,
    isLoadingSession,
    createAdminSession,
    sessionExpiry,
  } = useAdminAuthContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  useEffect(() => {
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  // ============ AUTHENTICATION LOGIC ============

  const isLoading =
    authStatus === "loading" ||
    isLoadingAuth ||
    (requiresSession && isLoadingSession);

  const needsPrivyAuth =
    authStatus === "privy_required" ||
    authStatus === "wallet_required" ||
    !authenticated ||
    !user;

  const needsBlockchainAuth =
    authStatus === "blockchain_denied" || (!isAdmin && !needsPrivyAuth);

  const needsSessionAuth =
    requiresSession &&
    (authStatus === "session_required" || (!hasValidSession && isAdmin));

  const isFullyAuthenticated =
    authenticated && !!user && isAdmin && (!requiresSession || hasValidSession);

  log.debug("AdminLayout render", {
    authStatus,
    authenticated,
    user: !!user,
    walletAddress,
    isAdmin,
    hasValidSession,
    isFullyAuthenticated,
    isLoading,
    requiresSession,
    needsPrivyAuth,
    needsBlockchainAuth,
    needsSessionAuth,
    isLoadingAuth,
    isLoadingSession,
  });

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-flame-yellow border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  // Step 1: Require Privy authentication
  if (needsPrivyAuth) {
    log.debug("Showing AdminAccessRequired - no Privy auth");
    return (
      <AdminAccessRequired message="Please connect your wallet to access admin features" />
    );
  }

  // Step 2: Require blockchain admin access (admin key ownership)
  if (needsBlockchainAuth) {
    log.debug("Showing AdminAccessRequired - no blockchain access");
    return (
      <AdminAccessRequired message="You need admin access to view this page" />
    );
  }

  // Step 3: Require valid admin session (if enabled)
  if (needsSessionAuth) {
    log.debug("Showing AdminSessionRequired - no valid session");
    return (
      <AdminSessionRequired
        onCreateSession={createAdminSession}
        sessionExpiry={sessionExpiry}
        message="A fresh admin session is required for enhanced security"
      />
    );
  }

  // Final security check - ensure we have proper authentication before rendering
  if (!authenticated || !user) {
    log.warn("Final check failed - not authenticated", {
      authenticated,
      hasUser: !!user,
    });
    return (
      <AdminAccessRequired message="Please connect your wallet to access admin features" />
    );
  }

  if (!isAdmin) {
    log.warn("Final check failed - not admin", { isAdmin, walletAddress });
    return (
      <AdminAccessRequired message="You need admin access to view this page" />
    );
  }

  if (requiresSession && !hasValidSession) {
    log.warn("Final check failed - no valid session", {
      hasValidSession,
      requiresSession,
    });
    return (
      <AdminSessionRequired
        onCreateSession={createAdminSession}
        sessionExpiry={sessionExpiry}
        message="A fresh admin session is required for enhanced security"
      />
    );
  }

  // ============ ADMIN LAYOUT RENDERING ============

  log.debug("Rendering admin layout with navigation");

  return (
    <div className="min-h-screen bg-black">
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="bg-gray-900 border-b border-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSidebarOpen(true)}
                className="text-gray-400 hover:text-white p-2"
                aria-label="Open navigation menu"
              >
                <Menu className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-flame-yellow">
                  Admin Panel
                </h1>
                <span className="text-gray-400 text-xs">
                  P2E Inferno Management
                </span>
              </div>
            </div>
            <PrivyConnectButton />
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {isDesktop && (
        <div className="bg-gray-900 border-b border-gray-800">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setSidebarExpanded(!sidebarExpanded)}
                className="text-gray-400 hover:text-white p-2 rounded-lg transition-colors"
                aria-label="Toggle sidebar"
              >
                {sidebarExpanded ? (
                  <ChevronLeft className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
              </button>
              <h1 className="text-xl font-bold text-flame-yellow">
                Admin Panel
              </h1>
              <span className="text-gray-400 text-sm">
                P2E Inferno Management
              </span>
            </div>
            <div className="flex items-center">
              <PrivyConnectButton />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && !isDesktop && (
        <div className="fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-black bg-opacity-50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-gray-900 shadow-lg flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-800 flex-shrink-0">
              <h2 className="text-lg font-semibold text-white">Navigation</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-gray-400 hover:text-white p-2"
                aria-label="Close navigation menu"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {adminNavItems.map((item) => {
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center px-4 py-3 text-gray-300 hover:text-flame-yellow hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Layout Container */}
      <div className="flex">
        {/* Desktop Sidebar - Hidden on mobile */}
        {isDesktop && (
          <div
            className={`${sidebarExpanded ? "w-64" : "w-16"} bg-gray-900 min-h-screen transition-all duration-300 ease-in-out`}
          >
            <div className="p-4">
              <nav className="space-y-2">
                {adminNavItems.map((item) => {
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className="flex items-center px-3 py-3 text-gray-300 hover:text-flame-yellow hover:bg-gray-800 rounded-lg transition-colors group relative"
                      title={!sidebarExpanded ? item.name : undefined}
                    >
                      <item.icon className="h-5 w-5 flex-shrink-0" />
                      {sidebarExpanded && (
                        <span className="ml-3 transition-opacity duration-300">
                          {item.name}
                        </span>
                      )}
                      {!sidebarExpanded && (
                        <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-sm rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
                          {item.name}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          <div className="p-6 lg:p-8 pb-12">
            <div className="max-w-7xl mx-auto">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

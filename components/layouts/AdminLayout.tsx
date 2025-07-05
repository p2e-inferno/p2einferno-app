import React, { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { FlameIcon } from "../icons/dashboard-icons";
import AdminNavigation from "../admin/AdminNavigation";
import { PrivyConnectButton } from "../PrivyConnectButton";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <div className="flex min-h-screen bg-black">
      {/* Sidebar - Desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col">
        <div className="flex flex-col flex-grow border-r border-gray-800 bg-black pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <Link href="/admin" className="flex items-center">
              <FlameIcon className="h-8 w-8" />
              <span className="ml-2 text-xl font-bold text-white">
                P2E Admin
              </span>
            </Link>
          </div>
          <div className="mt-8 flex-grow flex flex-col">
            <AdminNavigation variant="desktop" />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden">
          <div className="flex items-center justify-between border-b border-gray-800 bg-black px-4 py-4">
            <div>
              <Link href="/admin" className="flex items-center">
                <FlameIcon className="h-8 w-8" />
                <span className="ml-2 text-lg font-bold text-white">
                  P2E Admin
                </span>
              </Link>
            </div>
            <div className="flex items-center space-x-2">
              <PrivyConnectButton />
              {/* Mobile menu button */}
              <button
                onClick={toggleMobileMenu}
                className="p-1 rounded-md text-gray-400 hover:text-white focus:outline-none"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-40 flex md:hidden">
              {/* Overlay */}
              <div
                className="fixed inset-0 bg-black bg-opacity-75"
                aria-hidden="true"
                onClick={toggleMobileMenu}
              />

              {/* Drawer */}
              <div className="relative flex-1 flex flex-col max-w-xs w-full bg-black border-r border-gray-800">
                <div className="px-4 pt-5 pb-4 space-y-8">
                  <div className="flex items-center justify-between">
                    <Link
                      href="/admin"
                      className="flex items-center"
                      onClick={toggleMobileMenu}
                    >
                      <FlameIcon className="h-8 w-8" />
                      <span className="ml-2 text-xl font-bold text-white">
                        P2E Admin
                      </span>
                    </Link>
                    <button
                      onClick={toggleMobileMenu}
                      className="p-1 rounded-md text-gray-400 hover:text-white focus:outline-none"
                    >
                      <X className="h-6 w-6" aria-hidden="true" />
                    </button>
                  </div>

                  <AdminNavigation
                    variant="mobile"
                    onClick={toggleMobileMenu}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex md:items-center md:justify-end md:px-6 md:py-4 border-b border-gray-800 bg-black">
          <PrivyConnectButton />
        </div>

        {/* Main content */}
        <div className="flex-1 relative z-0 overflow-auto focus:outline-none">
          <div className="py-6 px-4 sm:px-6 lg:px-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

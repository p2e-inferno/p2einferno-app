import React, { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Menu, X, Gamepad2, Wallet } from "lucide-react";
import Link from "next/link";
import { PrivyConnectButton } from "../PrivyConnectButton";

export function Navbar() {
  const { login, authenticated, ready } = usePrivy();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { label: "About", href: "/about" },
    { label: "How It Works", href: "/how-it-works" },
    { label: "Services", href: "/services" },
  ];

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const renderAuthControls = (isMobile = false) => {
    // Show loading state if Privy isn't ready yet
    if (!ready) {
      return (
        <div
          className={`h-10 ${
            isMobile ? "w-full" : "w-40"
          } rounded-full bg-white/5 animate-pulse`}
        />
      );
    }

    if (authenticated) {
      return <PrivyConnectButton />;
    }

    const handleLogin = () => {
      if (isMobile) {
        toggleMenu();
      }
      login();
    };

    return (
      <Button
        onClick={handleLogin}
        className={`bg-steel-red hover:bg-steel-red/90 text-white rounded-full ${
          isMobile ? "w-full" : ""
        }`}
      >
        <Wallet className="mr-2 h-4 w-4" />
        Connect Wallet
      </Button>
    );
  };

  return (
    <nav
      className={`fixed top-0 w-full z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-background/80 backdrop-blur-lg border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-20">
          <Link href="/" className="flex items-center space-x-2 z-50 relative">
            <Gamepad2 className="w-8 h-8 text-flame-yellow" />
            <span className="text-xl font-bold font-heading">P2E INFERNO</span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="text-faded-grey hover:text-white transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center space-x-4">
            {renderAuthControls()}
          </div>

          <div className="md:hidden">
            <button onClick={toggleMenu} className="text-white">
              {isMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-background/95 backdrop-blur-lg py-4">
          <div className="container mx-auto px-4 flex flex-col space-y-4">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                onClick={toggleMenu}
                className="text-faded-grey hover:text-white transition-colors text-center py-2"
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-border flex justify-center">
              {renderAuthControls(true)}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

import React from "react";
import { Navbar } from "../home/Navbar";
import { Footer } from "../home/Footer";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <>
      <Navbar />
      <main className="pt-[60px]">{children}</main>
      <Footer />
    </>
  );
}

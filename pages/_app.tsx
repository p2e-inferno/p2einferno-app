import "../styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import React from "react";
import dynamic from "next/dynamic";
import { Toaster } from "react-hot-toast";

const DynamicClientSideWrapper = dynamic(
  () => import("../components/ClientSideWrapper"),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-faded-grey">Loading P2E INFERNO...</p>
        </div>
      </div>
    ),
  }
);

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>P2E Inferno - The Onchain Economy as a Game</title>
        <meta
          name="description"
          content="Engage with the onchain economy through a gamified experience. Join our bootcamp to master Web3."
        />
        <link rel="icon" href="/favicon.ico" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;700&family=Chakra+Petch:wght@700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <DynamicClientSideWrapper>
        <Toaster
          position="top-right"
          toastOptions={{
            className: "font-medium",
            duration: 4000,
            style: {
              background: "hsl(var(--background))",
              color: "hsl(var(--foreground))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "14px",
              padding: "12px 16px",
              boxShadow:
                "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
            },
            success: {
              duration: 3000,
              style: {
                background: "hsl(142 76% 36%)",
                color: "white",
                border: "1px solid hsl(142 76% 30%)",
              },
              iconTheme: {
                primary: "white",
                secondary: "hsl(142 76% 36%)",
              },
            },
            error: {
              duration: 6000, // Longer duration for errors
              style: {
                background: "hsl(0 84% 60%)",
                color: "white",
                border: "1px solid hsl(0 84% 50%)",
              },
              iconTheme: {
                primary: "white",
                secondary: "hsl(0 84% 60%)",
              },
            },
            loading: {
              duration: Infinity,
              style: {
                background: "hsl(var(--muted))",
                color: "hsl(var(--muted-foreground))",
                border: "1px solid hsl(var(--border))",
              },
            },
          }}
        />
        <Component {...pageProps} />
      </DynamicClientSideWrapper>
    </>
  );
}

export default MyApp;

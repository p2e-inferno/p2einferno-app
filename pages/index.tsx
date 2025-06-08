import { GetServerSideProps } from "next";
import { PrivyClient } from "@privy-io/server-auth";
import Head from "next/head";
import { Hero } from "@/components/home/Hero";
import { HowItWorks } from "@/components/home/HowItWorks";
import { Features } from "@/components/home/Features";
import { About } from "@/components/home/About";
import { Services } from "@/components/home/Services";
import { Bootcamps } from "@/components/home/Bootcamps";
import { MainLayout } from "@/components/layouts/MainLayout";

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const cookieAuthToken = req.cookies["privy-token"];

  // If no cookie is found, skip any further checks
  if (!cookieAuthToken) return { props: {} };

  const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const PRIVY_APP_SECRET = process.env.NEXT_PRIVY_APP_SECRET;
  const client = new PrivyClient(PRIVY_APP_ID!, PRIVY_APP_SECRET!);

  try {
    const claims = await client.verifyAuthToken(cookieAuthToken);
    // Use claims to pass user data to the page
    return { props: { userId: claims.userId } };
  } catch (error) {
    // If the token is invalid, clear the cookie
    return { props: {} };
  }
};

export default function Home() {
  return (
    <>
      <Head>
        <title>P2E INFERNO - The Onchain Economy as a Game</title>
        <meta
          name="description"
          content="P2E INFERNO is a blockchain gaming guild that enhances user interactions with blockchain technology through gamification and incentives."
        />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <MainLayout>
        <div className="bg-background">
          <Hero />
          <About />
          <Bootcamps />
          <Features />
          <HowItWorks />
          <Services />
        </div>
      </MainLayout>
    </>
  );
}

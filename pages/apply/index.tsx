import React, { useEffect } from "react";
import { useRouter } from "next/router";
import { usePrivy } from "@privy-io/react-auth";
import Head from "next/head";
import Link from "next/link";
import { MainLayout } from "../../components/layouts/MainLayout";
import {
  infernalSparksProgram,
  currentCohort,
  formatCurrency,
  calculateTimeRemaining,
} from "../../lib/bootcamp-data";
import {
  FlameIcon,
  TrophyIcon,
  CrystalIcon,
} from "../../components/icons/dashboard-icons";
import {
  Clock,
  Users,
  Calendar,
  ArrowRight,
  BookOpen,
  Zap,
} from "lucide-react";

/**
 * Bootcamp Listing Page - Shows available bootcamps for authenticated users
 * Route: /apply
 */
export default function BootcampListingPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  if (!ready || !authenticated) {
    return null;
  }

  const timeRemaining = calculateTimeRemaining(
    currentCohort.registration_deadline
  );
  const spotsRemaining =
    currentCohort.max_participants - currentCohort.current_participants;
  const isRegistrationOpen = currentCohort.status === "open";

  return (
    <>
      <Head>
        <title>Join Bootcamp - P2E Inferno</title>
        <meta
          name="description"
          content="Join our Web3 bootcamps and start your infernal journey"
        />
      </Head>

      <MainLayout>
        <div className="min-h-screen bg-background py-12">
          <div className="container mx-auto px-4">
            {/* Hero Section */}
            <div className="text-center mb-12">
              <div className="flex justify-center mb-6">
                <FlameIcon
                  size={80}
                  className="text-flame-yellow animate-pulse"
                />
              </div>
              <h1 className="text-4xl lg:text-5xl font-bold font-heading mb-4">
                Join the Infernal Journey
              </h1>
              <p className="text-xl text-faded-grey max-w-2xl mx-auto">
                Transform your Web3 knowledge through our intensive bootcamps
                designed for every skill level
              </p>
            </div>

            {/* Available Bootcamps */}
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold mb-8 text-center">
                Available Bootcamps
              </h2>

              {/* Infernal Sparks Bootcamp Card */}
              <div className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 rounded-2xl border border-purple-500/20 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-flame-yellow/10 to-flame-orange/10 p-6 border-b border-purple-500/20">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-flame-yellow/20 rounded-xl">
                        <FlameIcon size={32} className="text-flame-yellow" />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold">
                          {infernalSparksProgram.name}
                        </h3>
                        <p className="text-faded-grey">Entry Level Bootcamp</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-flame-yellow">
                        {formatCurrency(infernalSparksProgram.cost_usd, "USD")}
                      </div>
                      <div className="text-sm text-faded-grey">
                        or{" "}
                        {formatCurrency(
                          infernalSparksProgram.cost_naira,
                          "NGN"
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Status Banner */}
                  {isRegistrationOpen ? (
                    <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
                      <p className="text-green-400 text-sm font-medium">
                        🟢 Registration Open - {timeRemaining}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                      <p className="text-red-400 text-sm font-medium">
                        🔴 Registration Closed
                      </p>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-6">
                  <p className="text-faded-grey mb-6 text-lg">
                    {infernalSparksProgram.description}
                  </p>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-background/30 rounded-xl p-4 text-center">
                      <Calendar
                        size={24}
                        className="text-cyan-400 mx-auto mb-2"
                      />
                      <div className="font-bold">
                        {infernalSparksProgram.duration_weeks} Weeks
                      </div>
                      <div className="text-xs text-faded-grey">Duration</div>
                    </div>
                    <div className="bg-background/30 rounded-xl p-4 text-center">
                      <CrystalIcon
                        size={24}
                        className="text-cyan-400 mx-auto mb-2"
                      />
                      <div className="font-bold">
                        {infernalSparksProgram.max_reward_dgt.toLocaleString()}{" "}
                        DGT
                      </div>
                      <div className="text-xs text-faded-grey">Max Rewards</div>
                    </div>
                    <div className="bg-background/30 rounded-xl p-4 text-center">
                      <Users size={24} className="text-cyan-400 mx-auto mb-2" />
                      <div className="font-bold">{spotsRemaining}</div>
                      <div className="text-xs text-faded-grey">Spots Left</div>
                    </div>
                    <div className="bg-background/30 rounded-xl p-4 text-center">
                      <Clock size={24} className="text-cyan-400 mx-auto mb-2" />
                      <div className="font-bold">8hrs/week</div>
                      <div className="text-xs text-faded-grey">Time Commit</div>
                    </div>
                  </div>

                  {/* Key Features */}
                  <div className="mb-8">
                    <h4 className="text-xl font-bold mb-4">
                      What You'll Learn
                    </h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="flex items-start space-x-3">
                        <Zap
                          size={20}
                          className="text-flame-yellow mt-1 flex-shrink-0"
                        />
                        <div>
                          <div className="font-medium">Web3 Foundations</div>
                          <div className="text-sm text-faded-grey">
                            Wallets, accounts, and basic blockchain concepts
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <BookOpen
                          size={20}
                          className="text-flame-yellow mt-1 flex-shrink-0"
                        />
                        <div>
                          <div className="font-medium">DeFi Interactions</div>
                          <div className="text-sm text-faded-grey">
                            Token swaps and decentralized protocols
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <TrophyIcon
                          size={20}
                          className="text-flame-yellow mt-1 flex-shrink-0"
                        />
                        <div>
                          <div className="font-medium">NFTs & Community</div>
                          <div className="text-sm text-faded-grey">
                            Token-gating and Web3 social platforms
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start space-x-3">
                        <CrystalIcon
                          size={20}
                          className="text-flame-yellow mt-1 flex-shrink-0"
                        />
                        <div>
                          <div className="font-medium">Earn While Learning</div>
                          <div className="text-sm text-faded-grey">
                            Up to 24,000 DGT tokens in rewards
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="text-center">
                    {isRegistrationOpen ? (
                      <Link
                        href={`/apply/${currentCohort.id}`}
                        className="inline-flex items-center space-x-3 bg-flame-yellow text-black px-8 py-4 rounded-xl font-bold text-lg hover:bg-flame-orange transition-all duration-300 hover:scale-105"
                      >
                        <span>Apply Now</span>
                        <ArrowRight size={20} />
                      </Link>
                    ) : (
                      <div className="inline-flex items-center space-x-3 bg-gray-600 text-gray-300 px-8 py-4 rounded-xl font-bold text-lg cursor-not-allowed">
                        <span>Registration Closed</span>
                      </div>
                    )}
                    <p className="text-sm text-faded-grey mt-4">
                      Next cohort starts {currentCohort.start_date}
                    </p>
                  </div>
                </div>
              </div>

              {/* Coming Soon Section */}
              <div className="mt-12 text-center">
                <h3 className="text-2xl font-bold mb-4">
                  More Bootcamps Coming Soon
                </h3>
                <p className="text-faded-grey mb-6">
                  We're developing advanced bootcamps for intermediate and
                  expert Web3 practitioners
                </p>
                <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                  <div className="bg-background/20 border border-faded-grey/20 rounded-xl p-6">
                    <h4 className="font-bold mb-2">Advanced DeFi</h4>
                    <p className="text-sm text-faded-grey">
                      Deep dive into yield farming, liquidity provision, and
                      protocol governance
                    </p>
                  </div>
                  <div className="bg-background/20 border border-faded-grey/20 rounded-xl p-6">
                    <h4 className="font-bold mb-2">NFT Creator Program</h4>
                    <p className="text-sm text-faded-grey">
                      Learn to create, mint, and market your own NFT collections
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </>
  );
}

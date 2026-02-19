import Head from "next/head";
import Link from "next/link";
import { Shield, CheckCircle2, ArrowRight, Zap, Lock, ScanLine, Trophy, BadgeCheck } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { FaceVerificationButton } from "@/components/gooddollar/FaceVerificationButton";

export default function GoodDollarVerificationPage() {
  return (
    <>
      <Head>
        <title>GoodDollar Verification | P2E INFERNO</title>
        <meta
          name="description"
          content="Elevate your status on P2E INFERNO. Verify with GoodDollar to unlock premium quests and exclusive reward pools."
        />
      </Head>

      <MainLayout>
        <div className="bg-[#0B0A1F] text-white min-h-screen overflow-hidden relative">
          {/* Background Decorative Elements */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px]" />
          </div>

          <div className="relative z-10">
            {/* Hero Section */}
            <section className="pt-32 pb-16 md:pt-48 md:pb-32">
              <div className="container mx-auto px-4 max-w-5xl text-center">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400 text-xs font-bold uppercase tracking-widest mb-10 animate-fade-in shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                  <Shield className="w-3.5 h-3.5" />
                  Elevate Your Status
                </div>
                <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold font-heading mb-8 tracking-tight leading-tight">
                  The{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                    Trusted Path
                  </span>{" "}
                  to <br className="hidden md:block" /> Premium Rewards
                </h1>
                <p className="text-gray-400 mb-4">
                  Join the elite tier of Infernals.
                </p>
                <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
                  GoodDollar verification proves your uniqueness, unlocking
                  quests with higher rewards and exclusive features in P2E
                  INFERNO.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                  <FaceVerificationButton
                    size="lg"
                    className="px-10 h-14 text-lg bg-blue-600 hover:bg-blue-700 border-none shadow-lg shadow-blue-600/30 rounded-full transition-all hover:scale-105 active:scale-95"
                  />
                  <Link
                    href="/lobby/quests"
                    className="flex items-center justify-center gap-2 px-10 h-14 text-lg border border-white/10 bg-white/5 hover:bg-white/10 rounded-full transition-all hover:scale-105 active:scale-95 font-medium text-gray-200"
                  >
                    View Active Quests <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </div>
              </div>
            </section>

            {/* Benefits Grid */}
            <section className="py-24 bg-white/[0.01] border-y border-white/[0.05]">
              <div className="container mx-auto px-4 max-w-6xl">
                <div className="text-center mb-16">
                  <h2 className="text-3xl md:text-5xl font-bold mb-4 font-heading">
                    What Verification Actually Unlocks
                  </h2>
                  <p className="text-gray-400 text-lg">
                    Verify your account to unlock these features and more.
                  </p>
                </div>
                <div className="grid md:grid-cols-3 gap-8">
                  <BenefitCard
                    icon={<Trophy className="w-6 h-6 text-yellow-400" />}
                    title="Verified-Only Quests"
                    description="Access quests marked 'GoodDollar Verification Required' and continue through quest paths that stay locked for unverified accounts."
                  />
                  <BenefitCard
                    icon={<BadgeCheck className="w-6 h-6 text-green-400" />}
                    title="Use the DG Token Market"
                    description="Access the DG Token Market to buy or sell DG and swap between UP, ETH, and USDC in one simple interface."
                  />
                  <BenefitCard
                    icon={<Zap className="w-6 h-6 text-blue-400" />}
                    title="Exclusive Quests & Perks"
                    description="Unlock ecosystem-aligned quests, partner rewards, and advanced features reserved for verified participants."
                  />
                </div>
              </div>
            </section>

            {/* User Journey */}
            <section className="py-32">
              <div className="container mx-auto px-4 max-w-4xl text-center">
                <div className="mb-20">
                  <h2 className="text-4xl md:text-5xl font-bold mb-6 font-heading">
                    A Seamless Journey
                  </h2>
                  <p className="text-gray-400 text-lg">
                    Unlock your full potential in three simple, privacy-first
                    steps.
                  </p>
                </div>

                <div className="relative">
                  {/* Vertical line for mobile and desktop - centered */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/50 via-purple-500/50 to-transparent -translate-x-1/2 hidden sm:block" />

                  <div className="space-y-20 relative">
                    <StepItem
                      number="01"
                      title="Identity Connection"
                      description="Connect your active wallet. We instantly check the GoodDollar registry for your existing on-chain verification status."
                    />
                    <StepItem
                      number="02"
                      title="Secure Face Scan"
                      description="If not yet verified, a quick 3D face scan proves you're a unique human. This process is encrypted and privacy-protected."
                    />
                    <StepItem
                      number="03"
                      title="Level Up Access"
                      description="Once confirmed, your account is immediately upgraded. Start claiming premium rewards across the Infernal Lobby."
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Trust Section */}
            <section className="py-24 bg-gradient-to-b from-transparent to-black/20">
              <div className="container mx-auto px-4 max-w-5xl">
                <div className="bg-gradient-to-br from-gray-900/50 to-blue-900/10 border border-white/10 rounded-[2.5rem] p-8 md:p-14 overflow-hidden relative shadow-2xl">
                  <div className="absolute top-0 right-0 p-8 opacity-5">
                    <Lock className="w-48 h-48" />
                  </div>
                  <div className="relative z-10 max-w-2xl">
                    <h2 className="text-3xl md:text-4xl font-bold mb-8 flex items-center gap-4 font-heading">
                      <ScanLine className="text-blue-400 w-10 h-10" />
                      Verified Human. Fair Rewards.
                    </h2>
                    <p className="text-gray-300 text-lg mb-10 leading-relaxed font-light">
                      P2E Inferno uses GoodDollar verification to confirm that
                      each account belongs to a real, unique person. This helps
                      ensure rewards go to genuine participants—not duplicate or
                      automated accounts. Your verification status is checked
                      securely on-chain, and P2E Inferno only references the
                      verification result—not your personal biometric data.
                    </p>
                    <div className="flex flex-wrap gap-4">
                      <TrustBadge
                        icon={
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        }
                        text="Onchain"
                      />
                      <TrustBadge
                        icon={
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        }
                        text="Human Verified"
                      />
                      <TrustBadge
                        icon={
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                        }
                        text="Privacy First"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Final CTA */}
            <section className="py-32 text-center bg-[#0B0A1F]">
              <div className="container mx-auto px-4">
                <h2 className="text-4xl md:text-6xl font-bold mb-10 font-heading">
                  Ready to Level Up?
                </h2>
                <div className="flex justify-center">
                  <FaceVerificationButton
                    size="lg"
                    className="px-16 h-18 text-xl rounded-full bg-blue-600 hover:bg-blue-700 border-none shadow-2xl shadow-blue-600/40 transition-all hover:scale-110 active:scale-95 py-8"
                  />
                </div>
              </div>
            </section>
          </div>
        </div>
      </MainLayout>
    </>
  );
}

function TrustBadge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-300 bg-white/5 border border-white/10 px-5 py-2.5 rounded-full backdrop-blur-sm">
      {icon}
      {text}
    </div>
  );
}

function BenefitCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/[0.08] p-8 rounded-3xl hover:bg-white/[0.05] transition-all duration-500 group hover:-translate-y-2 shadow-sm hover:shadow-blue-500/10">
      <div className="w-14 h-14 rounded-2xl bg-white/[0.05] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-inner">
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-4 font-heading">{title}</h3>
      <p className="text-gray-400 leading-relaxed font-light text-lg">{description}</p>
    </div>
  );
}

function StepItem({ number, title, description }: { number: string; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center text-center max-w-2xl mx-auto">
      <div className="relative z-10 flex items-center justify-center w-14 h-14 rounded-full bg-[#0B0A1F] border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.5)] mb-8">
        <span className="text-lg font-bold text-blue-400 leading-none">{number}</span>
      </div>
      <h3 className="text-2xl font-bold mb-4 font-heading">{title}</h3>
      <p className="text-gray-400 text-lg leading-relaxed">{description}</p>
    </div>
  );
}

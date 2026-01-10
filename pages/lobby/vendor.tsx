/**
 * Vendor Page
 *
 * Main page for DG Token Vendor interactions.
 * Displays swap interface, light up button, and level up card.
 * Route: /lobby/vendor
 */

import { LobbyLayout } from "@/components/layouts/lobby-layout";
import VendorSwap from "@/components/vendor/VendorSwap";
import LevelUpCard from "@/components/vendor/LevelUpCard";
import LightUpButton from "@/components/vendor/LightUpButton";
import { useDGProfile } from "@/hooks/vendor/useDGProfile";

export default function VendorPage() {
  const { stageLabel } = useDGProfile();

  return (
    <LobbyLayout>
      <div className="flex flex-col items-center py-8">
        {/* Header */}
        <header className="w-full max-w-5xl mx-auto px-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-3xl font-bold text-white">DG Token Vendor</h1>
          <div className="text-right">
            <p className="text-gray-400 text-sm">Current Stage</p>
            <p className="text-2xl font-semibold text-flame-yellow">
              {stageLabel}
            </p>
          </div>
        </header>

        {/* Main Content: Uniswap-style centered layout */}
        <section className="w-full max-w-5xl mx-auto mt-8 px-4 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-center">
          {/* Primary swap card */}
          <div className="w-full lg:max-w-md">
            <VendorSwap />
          </div>

          {/* Side info column */}
          <div className="w-full lg:max-w-sm space-y-6">
            <LightUpButton />
            <LevelUpCard />
          </div>
        </section>
      </div>
    </LobbyLayout>
  );
}

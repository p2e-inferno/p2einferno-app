/**
 * Vendor Page
 *
 * Main page for DG Token Vendor interactions.
 * Displays swap interface, light up button, and level up card.
 */

import { MainLayout } from "@/components/layouts/MainLayout";
import VendorSwap from "@/components/vendor/VendorSwap";
import LevelUpCard from "@/components/vendor/LevelUpCard";
import LightUpButton from "@/components/vendor/LightUpButton";
import { useDGProfile } from "@/hooks/vendor/useDGProfile";

export default function VendorPage() {
    const { userState } = useDGProfile();

    return (
        <MainLayout>
            <div className="container mx-auto p-6 space-y-8">
                {/* Header */}
                <header className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold text-white">DG Token Vendor</h1>
                    <div className="text-right">
                        <p className="text-gray-400">Current Stage</p>
                        <p className="text-2xl text-flame-yellow">
                            {userState?.stage ?? "Unknown"}
                        </p>
                    </div>
                </header>

                {/* Main Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Swap Area */}
                    <div className="md:col-span-2 space-y-6">
                        <VendorSwap />
                    </div>

                    {/* Sidebar */}
                    <div className="space-y-6">
                        <LightUpButton />
                        <LevelUpCard />
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}

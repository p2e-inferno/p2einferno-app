import React from "react";

/**
 * ComingSoonSection Component
 *
 * Displays a preview of upcoming bootcamp programs that are in development.
 * Shows future courses and features to build excitement and gather interest.
 */
export const ComingSoonSection: React.FC = () => {
  return (
    <div className="mt-12 text-center">
      <h3 className="text-2xl font-bold mb-4">More Bootcamps Coming Soon</h3>
      <p className="text-faded-grey mb-6">
        We&apos;re developing advanced bootcamps for intermediate and expert Web3
        practitioners
      </p>
      <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <div className="bg-background/20 border border-faded-grey/20 rounded-xl p-6">
          <h4 className="font-bold mb-2">Advanced DeFi</h4>
          <p className="text-sm text-faded-grey">
            Deep dive into yield farming, liquidity provision, and protocol
            governance
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
  );
};

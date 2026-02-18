import React, { useEffect, useState } from "react";
import type { BootcampWithCohorts } from "@/lib/supabase/types";

import { NetworkError } from "@/components/ui/network-error";
import { BootcampsComingSoon, BootcampCard } from "@/components/bootcamps";
import { Carousel } from "@/components/ui/carousel";
import { getLogger } from "@/lib/utils/logger";
import { Flame } from "lucide-react";

const log = getLogger("home:Bootcamps");

interface BootcampsProps {
  bootcamps: BootcampWithCohorts[];
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
}

export function Bootcamps({ bootcamps, loading, error, onRetry }: BootcampsProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  useEffect(() => {
    if (error) {
      setIsErrorDismissed(false);
    }
  }, [error]);

  const handleClearError = () => {
    setIsErrorDismissed(true);
  };

  const handleRetry = async () => {
    try {
      setIsRetrying(true);
      await onRetry();
    } catch (err) {
      log.error("Error retrying bootcamps fetch:", err);
    } finally {
      setIsRetrying(false);
    }
  };

  if (loading) {
    return (
      <section id="bootcamps" className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-flame-yellow mx-auto"></div>
            <p className="mt-4 text-faded-grey">Loading bootcamps...</p>
          </div>
        </div>
      </section>
    );
  }

  if (error && !isRetrying && !isErrorDismissed) {
    return (
      <section id="bootcamps" className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold font-heading mb-4">
              Bootcamp Programs
            </h2>
            <p className="text-base md:text-lg text-faded-grey max-w-3xl mx-auto">
              Accelerate your Web3 journey through our immersive bootcamp
              experiences. Learn by doing, earn while learning, and join our
              thriving community.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <NetworkError
              error={error}
              onRetry={handleRetry}
              onClear={handleClearError}
              isRetrying={isRetrying}
            />
          </div>
        </div>
      </section>
    );
  }

  // Get bootcamps with cohorts and sort by cohort priority
  const activeBootcamps = bootcamps
    .filter((b) => b.cohorts.length > 0)
    .sort((a, b) => {
      // Priority: open > upcoming > closed
      const getPriority = (bootcamp: BootcampWithCohorts) => {
        const hasOpenCohort = bootcamp.cohorts.some((c) => c.status === "open");
        const hasUpcomingCohort = bootcamp.cohorts.some(
          (c) => c.status === "upcoming",
        );

        if (hasOpenCohort) return 0; // Highest priority
        if (hasUpcomingCohort) return 1; // Medium priority
        return 2; // Lowest priority (closed)
      };

      return getPriority(a) - getPriority(b);
    });

  return (
    <section id="bootcamps" className="py-16 md:py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold font-heading mb-4">
            Bootcamp Tracks
          </h2>
          <p className="text-base md:text-lg text-faded-grey max-w-3xl mx-auto">
            Each bootcamp is a track through the onchain economy. Learn by
            doing, earn while learning, and join our community.
          </p>
        </div>

        <div className="max-w-6xl mx-auto">
          {/* Active Bootcamps Carousel */}
          {activeBootcamps.length > 0 ? (
            <div className="pt-8 pb-4">
              <Carousel
                options={{
                  loop: true,
                  align: "start",
                  slidesToScroll: 1,
                }}
                showDots={true}
                showArrows={true}
              >
                {activeBootcamps.map((bootcamp) => (
                  <BootcampCard key={bootcamp.id} bootcamp={bootcamp} />
                ))}
              </Carousel>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="p-4 bg-faded-grey/10 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Flame className="w-8 h-8 text-faded-grey" />
              </div>
              <h3 className="text-xl font-bold text-faded-grey mb-2">
                No Active Bootcamps
              </h3>
              <p className="text-faded-grey">
                Check back soon for upcoming programs!
              </p>
            </div>
          )}

          {/* Bootcamps Coming Soon */}
          <BootcampsComingSoon bootcamps={bootcamps} />
        </div>
      </div>
    </section>
  );
}

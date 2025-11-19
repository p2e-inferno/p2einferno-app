import React, { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { BootcampProgram, Cohort } from "@/lib/supabase/types";

import { NetworkError } from "@/components/ui/network-error";
import { BootcampsComingSoon, BootcampCard } from "@/components/bootcamps";
import { Carousel } from "@/components/ui/carousel";
import { getLogger } from "@/lib/utils/logger";
import { Flame } from "lucide-react";

const log = getLogger("home:Bootcamps");

interface BootcampWithCohorts extends BootcampProgram {
  cohorts: Cohort[];
}

export function Bootcamps() {
  const [bootcamps, setBootcamps] = useState<BootcampWithCohorts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const { authenticated, getAccessToken } = usePrivy();

  useEffect(() => {
    fetchBootcamps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  const fetchBootcamps = async (isRetry = false) => {
    try {
      if (isRetry) {
        setIsRetrying(true);
        setError(null);
      } else {
        setLoading(true);
      }

      // Use Next.js API route instead of direct Supabase calls
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      try {
        if (authenticated) {
          const token = await getAccessToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
      } catch {}

      const response = await fetch("/api/bootcamps", {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch bootcamps");
      }

      const result = await response.json();
      setBootcamps(result.data || []);
      setError(null);
    } catch (err: any) {
      log.error("Error fetching bootcamps:", err);
      setError(err.message || "Failed to load bootcamps");
    } finally {
      setLoading(false);
      setIsRetrying(false);
    }
  };

  const handleRetry = () => {
    fetchBootcamps(true);
  };

  const handleClearError = () => {
    setError(null);
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

  if (error && !isRetrying) {
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

  // Get bootcamps with cohorts (active bootcamps)
  const activeBootcamps = bootcamps.filter((b) => b.cohorts.length > 0);

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

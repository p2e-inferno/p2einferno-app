import React, { useState, useEffect } from "react";
import type { BootcampProgram, Cohort } from "@/lib/supabase/types";



import { NetworkError } from "@/components/ui/network-error";
import { BootcampsComingSoon, BootcampCard } from "@/components/bootcamps";
import { Carousel } from "@/components/ui/carousel";
import {
  Flame,
} from "lucide-react";

interface BootcampWithCohorts extends BootcampProgram {
  cohorts: Cohort[];
}

export function Bootcamps() {
  const [bootcamps, setBootcamps] = useState<BootcampWithCohorts[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    fetchBootcamps();
  }, []);

  const fetchBootcamps = async (isRetry = false) => {
    try {
      if (isRetry) {
        setIsRetrying(true);
        setError(null);
      } else {
        setLoading(true);
      }
      
      // Use Next.js API route instead of direct Supabase calls
      const response = await fetch("/api/bootcamps", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch bootcamps");
      }

      const result = await response.json();
      setBootcamps(result.data || []);
      setError(null);
    } catch (err: any) {
      console.error("Error fetching bootcamps:", err);
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
      <section id="bootcamps" className="py-20 md:py-32 bg-background">
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
      <section id="bootcamps" className="py-20 md:py-32 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold font-heading mb-4">
              Bootcamp Programs
            </h2>
            <p className="text-lg text-faded-grey max-w-3xl mx-auto">
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
  const activeBootcamps = bootcamps.filter(b => b.cohorts.length > 0);

  return (
    <section id="bootcamps" className="py-20 md:py-32 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold font-heading">
            Bootcamp Programs
          </h2>
          <p className="mt-4 text-lg text-faded-grey max-w-3xl mx-auto">
            Accelerate your Web3 journey through our immersive bootcamp
            experiences. Learn by doing, earn while learning, and join our
            thriving community.
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
                  <BootcampCard
                    key={bootcamp.id}
                    bootcamp={bootcamp}
                  />
                ))}
              </Carousel>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="p-4 bg-faded-grey/10 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Flame className="w-8 h-8 text-faded-grey" />
              </div>
              <h3 className="text-xl font-bold text-faded-grey mb-2">No Active Bootcamps</h3>
              <p className="text-faded-grey">Check back soon for upcoming programs!</p>
            </div>
          )}

          {/* Bootcamps Coming Soon */}
          <BootcampsComingSoon bootcamps={bootcamps} />
        </div>
      </div>
    </section>
  );
}

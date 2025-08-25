import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import type { BootcampProgram, Cohort } from "@/lib/supabase/types";
import { Carousel } from "@/components/ui/carousel";
import { BootcampCard } from "@/components/bootcamps/BootcampCard";
import { NetworkError } from "@/components/ui/network-error";

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
      
      // Fetch bootcamps with their cohorts
      const { data: bootcampsData, error: bootcampsError } = await supabase
        .from("bootcamp_programs")
        .select("*")
        .order("created_at", { ascending: false });

      if (bootcampsError) throw bootcampsError;

      // Fetch cohorts for each bootcamp
      const bootcampsWithCohorts = await Promise.all(
        (bootcampsData || []).map(async (bootcamp) => {
          const { data: cohortsData, error: cohortsError } = await supabase
            .from("cohorts")
            .select("*")
            .eq("bootcamp_program_id", bootcamp.id)
            .order("start_date", { ascending: false });

          if (cohortsError) throw cohortsError;

          return {
            ...bootcamp,
            cohorts: cohortsData || []
          };
        })
      );

      setBootcamps(bootcampsWithCohorts);
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

  const calculateTimeRemaining = (deadline: string) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "Registration Closed";
    if (diffDays === 0) return "Last Day!";
    if (diffDays === 1) return "1 day left";
    return `${diffDays} days left`;
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
          <Carousel
            options={{
              loop: true,
              align: "start",
              slidesToScroll: 1,
            }}
            showDots={true}
            showArrows={true}
          >
            {bootcamps.map((bootcamp) => (
              <BootcampCard
                key={bootcamp.id}
                bootcamp={bootcamp}
                calculateTimeRemaining={calculateTimeRemaining}
              />
            ))}
          </Carousel>
        </div>
      </div>
    </section>
  );
}

import React, { useCallback, useEffect, useState } from "react";
import useEmblaCarousel, { type EmblaCarouselType } from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";

interface CarouselProps {
  children: React.ReactNode;
  className?: string;
  options?: {
    loop?: boolean;
    align?: "start" | "center" | "end";
    slidesToScroll?: number;
    breakpoints?: {
      [key: string]: {
        slidesToScroll?: number;
      };
    };
  };
  showDots?: boolean;
  showArrows?: boolean;
}

export function Carousel({
  children,
  className,
  options = {},
  showDots = true,
  showArrows = true,
}: CarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: options.loop ?? true,
    align: options.align ?? "start",
    slidesToScroll: options.slidesToScroll ?? 1,
    breakpoints: {
      "(min-width: 768px)": {
        slidesToScroll: 2,
      },
      "(min-width: 1024px)": {
        slidesToScroll: 3,
      },
      ...options.breakpoints,
    },
  });

  const [prevBtnDisabled, setPrevBtnDisabled] = useState(true);
  const [nextBtnDisabled, setNextBtnDisabled] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollPrev = useCallback(
    () => emblaApi && emblaApi.scrollPrev(),
    [emblaApi]
  );

  const scrollNext = useCallback(
    () => emblaApi && emblaApi.scrollNext(),
    [emblaApi]
  );

  const scrollTo = useCallback(
    (index: number) => emblaApi && emblaApi.scrollTo(index),
    [emblaApi]
  );

  const onInit = useCallback((emblaApi: EmblaCarouselType) => {
    setScrollSnaps(emblaApi.scrollSnapList());
  }, []);

  const onSelect = useCallback((emblaApi: EmblaCarouselType) => {
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setPrevBtnDisabled(!emblaApi.canScrollPrev());
    setNextBtnDisabled(!emblaApi.canScrollNext());
  }, []);

  useEffect(() => {
    if (!emblaApi) return;

    onInit(emblaApi);
    onSelect(emblaApi);
    emblaApi.on("reInit", onInit);
    emblaApi.on("select", onSelect);
  }, [emblaApi, onInit, onSelect]);

  return (
    <div className={cn("relative", className)}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {React.Children.map(children, (child, index) => (
            <div
              key={index}
              className="flex-[0_0_100%] min-w-0 pl-4 md:flex-[0_0_50%] lg:flex-[0_0_33.333%]"
            >
              {child}
            </div>
          ))}
        </div>
      </div>

      {showArrows && (
        <div className="flex justify-between mt-8">
          <Button
            variant="outline"
            size="icon"
            onClick={scrollPrev}
            disabled={prevBtnDisabled}
            className="h-12 w-12 rounded-full border-flame-yellow/30 text-flame-yellow hover:bg-flame-yellow/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={scrollNext}
            disabled={nextBtnDisabled}
            className="h-12 w-12 rounded-full border-flame-yellow/30 text-flame-yellow hover:bg-flame-yellow/10 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      )}

      {showDots && scrollSnaps.length > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
              type="button"
              className={cn(
                "w-2 h-2 rounded-full transition-colors duration-300",
                index === selectedIndex
                  ? "bg-flame-yellow"
                  : "bg-faded-grey/40 hover:bg-faded-grey/60"
              )}
              onClick={() => scrollTo(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
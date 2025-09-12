import React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  id: string;
  title: string;
  description?: string;
}

interface ProgressStepsProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function ProgressSteps({
  steps,
  currentStep,
  className,
}: ProgressStepsProps) {
  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isUpcoming = stepNumber > currentStep;

          return (
            <div key={step.id} className="flex flex-col items-center flex-1">
              {/* Step circle */}
              <div className="flex items-center w-full">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                    {
                      "bg-steel-red text-white": isCompleted,
                      "bg-flame-yellow text-black": isCurrent,
                      "bg-faded-grey/20 text-faded-grey": isUpcoming,
                    },
                  )}
                >
                  {isCompleted ? <Check className="w-5 h-5" /> : stepNumber}
                </div>

                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="flex-1 h-px mx-4">
                    <div
                      className={cn("h-full transition-all duration-300", {
                        "bg-steel-red": isCompleted,
                        "bg-faded-grey/20": !isCompleted,
                      })}
                    />
                  </div>
                )}
              </div>

              {/* Step labels */}
              <div className="text-center mt-3">
                <p
                  className={cn(
                    "text-sm font-medium transition-colors duration-300",
                    {
                      "text-steel-red": isCompleted,
                      "text-flame-yellow": isCurrent,
                      "text-faded-grey": isUpcoming,
                    },
                  )}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-xs text-faded-grey mt-1">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

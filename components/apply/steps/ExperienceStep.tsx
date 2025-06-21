import React from "react";

// Define a type for the form data slice this component deals with
interface ExperienceFormData {
  experience_level: "beginner" | "intermediate" | "advanced";
}

// Define a type for the field errors slice (if any specific to this step)
// interface ExperienceFieldErrors {} // None for now

interface ExperienceStepProps {
  formData: ExperienceFormData;
  updateFormData: (field: keyof ExperienceFormData, value: any) => void;
  // fieldErrors: ExperienceFieldErrors; // No specific field errors for this step currently
}

// Constants for experience levels, extracted from the original page
const experienceLevels = [
  {
    value: "beginner" as const,
    label: "Beginner",
    description: "New to Web3 and blockchain technology",
  },
  {
    value: "intermediate" as const,
    label: "Intermediate",
    description: "Some experience with crypto or DeFi",
  },
  {
    value: "advanced" as const,
    label: "Advanced",
    description: "Experienced with Web3 protocols and tools",
  },
];

const ExperienceStep: React.FC<ExperienceStepProps> = ({
  formData,
  updateFormData,
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Experience Level</h2>
        <p className="text-faded-grey">
          Help us tailor the bootcamp to your needs
        </p>
      </div>

      <div className="space-y-4">
        {experienceLevels.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => updateFormData("experience_level", level.value)}
            className={`w-full p-6 border rounded-lg text-left transition-colors ${
              formData.experience_level === level.value
                ? "border-flame-yellow bg-flame-yellow/10"
                : "border-faded-grey/20 hover:border-faded-grey/40"
            }`}
            aria-pressed={formData.experience_level === level.value}
          >
            <div className="flex items-start gap-4">
              <div
                className={`w-4 h-4 rounded-full border-2 mt-1 ${
                  formData.experience_level === level.value
                    ? "border-flame-yellow bg-flame-yellow"
                    : "border-faded-grey/40"
                }`}
                aria-hidden="true" // Decorative element
              ></div>
              <div>
                <h3 className="font-bold text-lg">{level.label}</h3>
                <p className="text-faded-grey text-sm">
                  {level.description}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default ExperienceStep;

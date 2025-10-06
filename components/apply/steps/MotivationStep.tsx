import React from "react";
import { MessageCircle, XCircle } from "lucide-react"; // Assuming XCircle is for errors

// Define a type for the form data slice this component deals with
interface MotivationFormData {
  motivation: string;
  goals: string[];
}

// Define a type for the field errors slice
interface MotivationFieldErrors {
  motivation?: string;
  goals?: string;
}

interface MotivationStepProps {
  formData: MotivationFormData;
  updateFormData: (field: keyof MotivationFormData, value: any) => void;
  handleGoalToggle: (goal: string) => void; // Specific handler for goals
  fieldErrors: MotivationFieldErrors;
}

// Constants for goal options, extracted from the original page
const goalOptions = [
  "Learn Web3 fundamentals",
  "Earn DG tokens",
  "Join a community",
  "Build a portfolio",
  "Career transition",
  "Skill development",
  "Networking",
  "Cryptocurrency trading",
];

const MotivationStep: React.FC<MotivationStepProps> = ({
  formData,
  updateFormData,
  handleGoalToggle,
  fieldErrors,
}) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Motivation & Goals</h2>
        <p className="text-faded-grey">Tell us about your Web3 journey</p>
      </div>

      <div className="space-y-6">
        <div>
          <label
            htmlFor="motivation"
            className="block text-sm font-medium mb-2"
          >
            Why do you want to join Infernal Sparks?
          </label>
          <div className="relative">
            <MessageCircle className="absolute left-3 top-3 h-5 w-5 text-faded-grey" />
            <textarea
              id="motivation"
              className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent bg-background h-32 resize-none ${
                fieldErrors.motivation
                  ? "border-red-300 focus:ring-red-500"
                  : "border-faded-grey/20 focus:ring-flame-yellow"
              }`}
              placeholder="Share your motivation for joining this bootcamp..."
              value={formData.motivation}
              onChange={(e) => updateFormData("motivation", e.target.value)}
              aria-describedby={
                fieldErrors.motivation ? "motivation-error" : undefined
              }
            />
          </div>
          {fieldErrors.motivation && (
            <p
              id="motivation-error"
              className="mt-1 text-sm text-red-600 flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              {fieldErrors.motivation}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium mb-4">
            What are your goals? (Select all that apply)
          </label>
          {fieldErrors.goals && ( // Display general goals error if present
            <p
              id="goals-error"
              className="mb-2 text-sm text-red-600 flex items-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              {fieldErrors.goals}
            </p>
          )}
          <div
            className="grid grid-cols-2 gap-3"
            role="group"
            aria-labelledby="goals-label"
          >
            {goalOptions.map((goal) => (
              <button
                key={goal}
                type="button"
                onClick={() => handleGoalToggle(goal)}
                className={`p-3 border rounded-lg text-sm text-left transition-colors ${
                  formData.goals.includes(goal)
                    ? "border-flame-yellow bg-flame-yellow/10 text-flame-yellow"
                    : "border-faded-grey/20 hover:border-faded-grey/40"
                }`}
                aria-pressed={formData.goals.includes(goal)}
              >
                {goal}
              </button>
            ))}
          </div>
          <span id="goals-label" className="sr-only">
            What are your goals? Select all that apply.
          </span>
        </div>
      </div>
    </div>
  );
};

export default MotivationStep;

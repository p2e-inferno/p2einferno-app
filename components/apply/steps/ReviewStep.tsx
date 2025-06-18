import React from "react";
import { Card } from "@/components/ui/card"; // Assuming Card component is used as in original
import { User, Target, CheckCircle } from "lucide-react";

// Define a type for the full form data this component reviews
interface ReviewFormData {
  user_name: string;
  user_email: string;
  phone_number: string;
  experience_level: "beginner" | "intermediate" | "advanced"; // Re-declare for clarity or import from a shared types file
  motivation: string;
  goals: string[];
}

interface ReviewStepProps {
  formData: ReviewFormData;
  // No updateFormData or fieldErrors needed here as it's a display step,
  // but could add a prop to jump back to a specific step for editing.
  // e.g., onEditStep?: (step: number) => void;
}

// Mapping experience level values to labels for display
const experienceLevelLabels: Record<ReviewFormData["experience_level"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const ReviewStep: React.FC<ReviewStepProps> = ({ formData }) => {
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Review Application</h2>
        <p className="text-faded-grey">
          Please review your information before submitting
        </p>
      </div>

      <div className="space-y-6">
        <Card className="p-6 bg-card border-faded-grey/20">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <User className="w-5 h-5" />
            Personal Information
          </h3>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-faded-grey">Name:</span>{" "}
              {formData.user_name || "Not provided"}
            </p>
            <p>
              <span className="text-faded-grey">Email:</span>{" "}
              {formData.user_email || "Not provided"}
            </p>
            <p>
              <span className="text-faded-grey">Phone:</span>{" "}
              {formData.phone_number || "Not provided"}
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-card border-faded-grey/20">
          <h3 className="font-bold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Experience & Goals
          </h3>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-faded-grey">Level:</span>{" "}
              {experienceLevelLabels[formData.experience_level] || "Not provided"}
            </p>
            <p>
              <span className="text-faded-grey">Goals:</span>{" "}
              {formData.goals.length > 0 ? formData.goals.join(", ") : "Not selected"}
            </p>
            <p>
              <span className="text-faded-grey">Motivation:</span>{" "}
              <span className="whitespace-pre-wrap">
                {formData.motivation || "Not provided"}
              </span>
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-green-50 border-green-200">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-1" />
            <div>
              <h3 className="font-bold text-green-800 mb-2">
                Application Ready for Submission
              </h3>
              <p className="text-sm text-green-700 mb-3">
                Your application is complete and ready to submit. After
                clicking "Pay Registration Fee", your application will be
                saved securely and you'll be redirected to the payment page.
              </p>
              <div className="bg-green-100 p-3 rounded-md">
                <p className="text-xs text-green-800 font-medium">
                  💡 Your spot is only secured after successful payment
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ReviewStep;

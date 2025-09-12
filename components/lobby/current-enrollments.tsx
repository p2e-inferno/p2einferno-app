import React from "react";
import { CheckCircle, Clock, X } from "lucide-react";

interface Enrollment {
  id: string;
  cohort_id: string;
  enrollment_status: string;
  completion_date?: string;
  cohorts?: {
    id: string;
    name: string;
    bootcamp_program?: {
      name: string;
    };
  };
  user_journey_preferences?: Array<{
    id: string;
    is_hidden: boolean;
  }>;
}

interface CurrentEnrollmentsProps {
  enrollments: Enrollment[];
  onRemoveJourney?: (enrollmentId: string) => void;
}

/**
 * Current enrollments component displaying user's active journeys
 * Shows enrollment status and completion information
 */
export const CurrentEnrollments: React.FC<CurrentEnrollmentsProps> = ({
  enrollments,
  onRemoveJourney,
}) => {
  // Filter out enrollments that are hidden by user preference
  const visibleEnrollments = enrollments.filter((enrollment) => {
    // If no preferences exist, show the enrollment
    if (
      !enrollment.user_journey_preferences ||
      enrollment.user_journey_preferences.length === 0
    ) {
      return true;
    }
    // If preferences exist, only show if not hidden
    return !enrollment.user_journey_preferences[0]?.is_hidden;
  });

  if (visibleEnrollments.length === 0) {
    return null;
  }

  const getJourneyDisplayName = (enrollment: Enrollment) => {
    if (enrollment.cohorts?.name) {
      return enrollment.cohorts.name;
    }
    if (enrollment.cohorts?.bootcamp_program?.name) {
      return enrollment.cohorts.bootcamp_program.name;
    }
    return enrollment.cohort_id; // Fallback to UUID if no name available
  };

  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold mb-4">Your Journeys</h3>
      <div className="space-y-4">
        {visibleEnrollments.map((enrollment) => (
          <div
            key={enrollment.id}
            className="bg-gradient-to-r from-purple-800/20 to-indigo-800/20 rounded-xl p-6 border border-purple-500/20 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 className="font-bold text-lg">
                  {getJourneyDisplayName(enrollment)}
                </h4>
                <p className="text-faded-grey capitalize">
                  Status: {enrollment.enrollment_status}
                </p>
                {enrollment.completion_date && (
                  <p className="text-green-400 text-sm">
                    Completed:{" "}
                    {new Date(enrollment.completion_date).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  {enrollment.enrollment_status === "completed" ? (
                    <CheckCircle size={32} className="text-green-400" />
                  ) : (
                    <Clock size={32} className="text-yellow-400" />
                  )}
                </div>
                {onRemoveJourney && (
                  <button
                    onClick={() => onRemoveJourney(enrollment.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg transition-colors group"
                    title="Remove from lobby"
                  >
                    <X
                      size={20}
                      className="text-faded-grey group-hover:text-red-400 transition-colors"
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

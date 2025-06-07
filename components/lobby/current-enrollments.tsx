import React from "react";
import { CheckCircle, Clock } from "lucide-react";

interface Enrollment {
  id: string;
  cohort_id: string;
  enrollment_status: string;
  completion_date?: string;
}

interface CurrentEnrollmentsProps {
  enrollments: Enrollment[];
}

/**
 * Current enrollments component displaying user's active journeys
 * Shows enrollment status and completion information
 */
export const CurrentEnrollments: React.FC<CurrentEnrollmentsProps> = ({
  enrollments,
}) => {
  if (enrollments.length === 0) {
    return null;
  }

  return (
    <div className="mb-8">
      <h3 className="text-2xl font-bold mb-4">Your Journeys</h3>
      <div className="space-y-4">
        {enrollments.map((enrollment) => (
          <div
            key={enrollment.id}
            className="bg-gradient-to-r from-purple-800/20 to-indigo-800/20 rounded-xl p-6 border border-purple-500/20 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-lg">{enrollment.cohort_id}</h4>
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
              <div className="text-right">
                {enrollment.enrollment_status === "completed" ? (
                  <CheckCircle size={32} className="text-green-400" />
                ) : (
                  <Clock size={32} className="text-yellow-400" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

import React from "react";
import { AlertTriangle, CreditCard } from "lucide-react";

interface PendingApplication {
  id: string;
  status: string;
  created_at: string;
  applications: {
    cohort_id: string;
    experience_level: string;
  };
}

interface PendingApplicationsAlertProps {
  pendingApplications: PendingApplication[];
  onCompletePayment: (applicationId: string) => void;
}

/**
 * Alert component for pending applications that require payment completion
 */
export const PendingApplicationsAlert: React.FC<
  PendingApplicationsAlertProps
> = ({ pendingApplications, onCompletePayment }) => {
  return (
    <div className="mb-8 bg-gradient-to-r from-red-900/40 to-orange-900/40 rounded-xl p-6 border border-red-500/30 backdrop-blur-sm">
      <div className="flex items-start space-x-4">
        <AlertTriangle size={24} className="text-red-400 mt-1" />
        <div className="flex-1">
          <h3 className="font-bold text-red-300 mb-2">
            Incomplete Applications
          </h3>
          <p className="text-red-200 mb-4">
            You have {pendingApplications.length} application(s) awaiting
            payment completion.
          </p>
          <div className="space-y-3">
            {pendingApplications.map((app) => (
              <div
                key={app.id}
                className="bg-black/20 rounded-lg p-4 border border-red-500/20"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-red-200">
                      Cohort: {app.applications.cohort_id}
                    </p>
                    <p className="text-sm text-red-300">
                      Level: {app.applications.experience_level}
                    </p>
                    <p className="text-xs text-red-400">
                      Applied: {new Date(app.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onCompletePayment(app.id)}
                    className="flex items-center space-x-2 bg-flame-yellow text-black px-4 py-2 rounded-lg hover:bg-flame-orange transition-colors font-medium"
                  >
                    <CreditCard size={16} />
                    <span>Complete Payment</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

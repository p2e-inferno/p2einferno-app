import React, { useState } from "react";
import { AlertTriangle, CreditCard, X, Trash2, Settings } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";

interface PendingApplication {
  id: string;
  application_id: string; // Add this to get the actual application ID
  status: string;
  created_at: string;
  needsReconciliation?: boolean; // Flag for data inconsistencies
  applications: {
    cohort_id: string;
    experience_level: string;
  };
}

interface PendingApplicationsAlertProps {
  pendingApplications: PendingApplication[];
  onCompletePayment: (applicationId: string) => void;
  onRefresh?: () => void; // Add refresh callback
}

/**
 * Alert component for pending applications that require payment completion
 */
export const PendingApplicationsAlert: React.FC<
  PendingApplicationsAlertProps
> = ({ pendingApplications, onCompletePayment, onRefresh }) => {
  const { user, getAccessToken } = usePrivy();
  const [cancelingApp, setCancelingApp] = useState<string | null>(null);
  const [reconcilingApp, setReconcilingApp] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState<string | null>(
    null
  );

  const handleCancelApplication = async (applicationId: string) => {
    setCancelingApp(applicationId);

    try {
      const response = await fetch(`/api/applications/${applicationId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to cancel application");
      }

      // Success - refresh the data
      console.log("Application cancelled successfully");
      onRefresh?.();
    } catch (error) {
      console.error("Failed to cancel application:", error);
      alert(
        error instanceof Error ? error.message : "Failed to cancel application"
      );
    } finally {
      setCancelingApp(null);
      setShowConfirmDialog(null);
    }
  };

  const handleReconcileApplication = async (applicationId: string) => {
    if (!user) {
      alert('User not authenticated');
      return;
    }

    setReconcilingApp(applicationId);

    try {
      const token = await getAccessToken();
      
      // Use the same pattern as dashboard data hook
      const requestData = {
        applicationId,
        privyUserId: user.id,
        email: user.email?.address,
        walletAddress: user.wallet?.address,
      };

      const response = await fetch('/api/user/applications/reconcile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to reconcile application');
      }

      const result = await response.json();
      
      if (result.success) {
        console.log('Application reconciled successfully');
        onRefresh?.();
      } else {
        throw new Error(result.message || 'Reconciliation failed');
      }
    } catch (error) {
      console.error('Failed to reconcile application:', error);
      alert(
        error instanceof Error ? error.message : 'Failed to reconcile application'
      );
    } finally {
      setReconcilingApp(null);
    }
  };

  const ConfirmDialog = ({ applicationId }: { applicationId: string }) => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md mx-4">
        <h3 className="font-bold text-gray-900 mb-2">Cancel Application?</h3>
        <p className="text-gray-600 mb-4">
          Are you sure you want to cancel this application? This action cannot
          be undone and you will need to reapply if you change your mind.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setShowConfirmDialog(null)}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
          >
            Keep Application
          </button>
          <button
            onClick={() => handleCancelApplication(applicationId)}
            disabled={cancelingApp === applicationId}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {cancelingApp === applicationId ? "Canceling..." : "Yes, Cancel"}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
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
                    <div className="flex items-center space-x-2">
                      {app.needsReconciliation ? (
                        <button
                          onClick={() =>
                            handleReconcileApplication(app.application_id)
                          }
                          disabled={reconcilingApp === app.application_id}
                          className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
                        >
                          <Settings size={16} />
                          <span>
                            {reconcilingApp === app.application_id
                              ? "Reconciling..."
                              : "Resolve Application"}
                          </span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onCompletePayment(app.application_id)}
                          className="flex items-center space-x-2 bg-flame-yellow text-black px-4 py-2 rounded-lg hover:bg-flame-orange transition-colors font-medium"
                        >
                          <CreditCard size={16} />
                          <span>Complete Payment</span>
                        </button>
                      )}
                      {!app.needsReconciliation && (
                      <button
                        onClick={() => setShowConfirmDialog(app.application_id)}
                        disabled={cancelingApp === app.application_id}
                        className="flex items-center space-x-1 bg-red-600/80 text-red-100 px-3 py-2 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                        title="Cancel application"
                      >
                        <Trash2 size={14} />
                          <span className="text-sm">Cancel Application</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showConfirmDialog && <ConfirmDialog applicationId={showConfirmDialog} />}
    </>
  );
};

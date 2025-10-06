import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Shield, Clock } from "lucide-react";
import { toast } from "react-hot-toast";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("admin:AdminSessionRequired");

interface AdminSessionRequiredProps {
  onCreateSession: () => Promise<boolean>;
  sessionExpiry?: number | null;
  message?: string;
}

export default function AdminSessionRequired({
  onCreateSession,
  sessionExpiry,
  message,
}: AdminSessionRequiredProps) {
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  const handleCreateSession = async () => {
    setIsCreatingSession(true);
    try {
      log.info("User requesting admin session creation");
      const success = await onCreateSession();

      if (success) {
        toast.success("Admin session created successfully!");
        log.info("Admin session created successfully");
      } else {
        toast.error("Failed to create admin session");
        log.error("Failed to create admin session");
      }
    } catch (error: any) {
      log.error("Error creating admin session:", error);
      toast.error(error.message || "Failed to create admin session");
    } finally {
      setIsCreatingSession(false);
    }
  };

  const formatExpiry = (expiry: number) => {
    return new Date(expiry * 1000).toLocaleString();
  };

  const isSessionExpired = sessionExpiry && sessionExpiry * 1000 < Date.now();

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 p-6 bg-gray-900 rounded-lg border border-gray-800">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-900/20 mb-4">
            <Shield className="h-8 w-8 text-yellow-400" />
          </div>

          <h2 className="text-2xl font-bold text-white">
            Admin Session Required
          </h2>

          <p className="mt-2 text-sm text-gray-400">
            {message || "You need an active admin session to continue"}
          </p>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <div className="flex items-start space-x-3">
            <Clock className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-white">Session Status</h3>

              {sessionExpiry ? (
                <div className="text-xs text-gray-400 mt-1">
                  {isSessionExpired ? (
                    <span className="text-red-400">
                      Expired: {formatExpiry(sessionExpiry)}
                    </span>
                  ) : (
                    <span className="text-yellow-400">
                      Expires: {formatExpiry(sessionExpiry)}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">
                  No active admin session found
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-700 text-blue-300 px-4 py-3 rounded-lg">
            <div className="text-sm">
              <p className="font-medium mb-1">Enhanced Security</p>
              <p className="text-blue-400">
                Admin access requires a fresh authentication session for
                security. This ensures your admin actions are properly
                authorized.
              </p>
            </div>
          </div>

          <Button
            onClick={handleCreateSession}
            disabled={isCreatingSession}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-black font-medium"
          >
            {isCreatingSession ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Creating Session...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Create Admin Session
              </>
            )}
          </Button>

          <div className="text-xs text-gray-500 text-center">
            <p>
              This will verify your admin access and create a secure session.
              Sessions automatically expire after inactivity for security.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

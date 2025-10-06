import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyBadge } from "@/components/ui/badge";
import { useAdminApi } from "@/hooks/useAdminApi";
import { useSmartWalletSelection } from "../../hooks/useSmartWalletSelection";
import type { Cohort, BootcampProgram } from "@/lib/supabase/types";
import { toast } from "react-hot-toast";
import {
  formatErrorMessageForToast,
  showInfoToast,
} from "@/lib/utils/toast-utils";
import {
  generateCohortLockConfig,
  createLockConfigWithManagers,
} from "@/lib/blockchain/legacy";
import { getBlockExplorerUrl } from "@/lib/blockchain/services/transaction-service";
import {
  saveDraft,
  removeDraft,
  getDraft,
  updateDraftWithDeploymentResult,
  savePendingDeployment,
  removePendingDeployment,
} from "@/lib/utils/lock-deployment-state";
import { resolveDraftById } from "@/lib/utils/draft";
import { getRecordId } from "@/lib/utils/id-generation";
import { getLogger } from "@/lib/utils/logger";
import { useDeployAdminLock } from "@/hooks/unlock/useDeployAdminLock";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { convertLockConfigToDeploymentParams } from "@/lib/blockchain/shared/lock-config-converter";

const log = getLogger("admin:CohortForm");

interface CohortFormProps {
  cohort?: Cohort;
  isEditing?: boolean;
}

export default function CohortForm({
  cohort,
  isEditing = false,
}: CohortFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation state
  const [validationErrors, setValidationErrors] = useState<{
    name?: string;
    bootcamp_program_id?: string;
    start_date?: string;
    end_date?: string;
    registration_deadline?: string;
    naira_amount?: string;
    usdt_amount?: string;
  }>({});
  const [isFormValid, setIsFormValid] = useState(false);
  const [bootcampPrograms, setBootcampPrograms] = useState<BootcampProgram[]>(
    [],
  );
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(false);
  // Memoize options to prevent adminFetch from being recreated every render
  const adminApiOptions = useMemo(() => ({}), []);
  const { adminFetch } = useAdminApi(adminApiOptions);
  const { adminFetch: silentFetch } = useAdminApi({ suppressToasts: true });
  const wallet = useSmartWalletSelection();
  const [keyManagersInput, setKeyManagersInput] = useState<string>(
    cohort?.key_managers?.join(", ") || "",
  );

  const { isAdmin } = useAdminAuthContext();
  const { deployAdminLock, isLoading: isDeployingFromHook } =
    useDeployAdminLock({ isAdmin });

  // Lock deployment state
  const [isDeployingLock, setIsDeployingLock] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState<string>("");
  const [showAutoLockCreation, setShowAutoLockCreation] = useState(true);
  const [currentDeploymentId, setCurrentDeploymentId] = useState<string | null>(
    null,
  );
  const [lockManagerGranted, setLockManagerGranted] = useState(
    isEditing ? (cohort?.lock_manager_granted ?? true) : true,
  );
  const [grantFailureReason, setGrantFailureReason] = useState<
    string | undefined
  >(isEditing ? (cohort?.grant_failure_reason ?? undefined) : undefined);

  const [formData, setFormData] = useState<Partial<Cohort>>(
    cohort || {
      name: "",
      id: "",
      bootcamp_program_id: "",
      start_date: "",
      end_date: "",
      max_participants: 100,
      current_participants: 0,
      registration_deadline: "",
      status: "upcoming",
      lock_address: "",
      key_managers: [],
      usdt_amount: 0,
      naira_amount: 0,
    },
  );

  // Validation function - no dependencies needed, stable across renders
  const validateForm = (data: Partial<Cohort>) => {
    const errors: typeof validationErrors = {};

    // Required field validations
    if (!data.name?.trim()) {
      errors.name = "Cohort name is required";
    }

    if (!data.bootcamp_program_id) {
      errors.bootcamp_program_id = "Please select a bootcamp program";
    }

    if (!data.start_date) {
      errors.start_date = "Start date is required";
    }

    if (!data.end_date) {
      errors.end_date = "End date is required";
    }

    if (!data.registration_deadline) {
      errors.registration_deadline = "Registration deadline is required";
    }

    // Date validations
    if (
      data.start_date &&
      data.end_date &&
      new Date(data.end_date) <= new Date(data.start_date)
    ) {
      errors.end_date = "End date must be after start date";
    }

    // Pricing validations
    const nairaAmount = data.naira_amount || 0;
    const usdtAmount = data.usdt_amount || 0;

    if (nairaAmount < 10) {
      errors.naira_amount =
        "Naira amount must be at least ₦10 for Paystack payments";
    }

    if (usdtAmount < 1) {
      errors.usdt_amount =
        "USDT amount must be at least $1 for blockchain payments";
    }

    setValidationErrors(errors);
    setIsFormValid(Object.keys(errors).length === 0);

    return errors;
  };

  // Validate form whenever formData changes
  useEffect(() => {
    validateForm(formData);
  }, [formData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load draft data on mount
  useEffect(() => {
    if (isEditing) return;

    const draft = getDraft("cohort");
    if (!draft) return;

    let cancelled = false;

    const hydrateDraft = (showRestoreToast: boolean = true) => {
      setFormData((prev) => ({ ...prev, ...draft.formData }));

      if (draft.formData?.lock_manager_granted === false) {
        setLockManagerGranted(false);
        setGrantFailureReason(draft.formData.grant_failure_reason);
      }

      if (showRestoreToast) {
        if (draft.formData?.lock_address) {
          setShowAutoLockCreation(false);
          toast.success("Restored draft data with deployed lock");
        } else {
          toast.success("Restored draft data");
        }
      }
    };

    const fetchExisting = async (id: string) => {
      const response = await silentFetch<{ success: boolean; data?: Cohort }>(
        `/api/admin/cohorts/${id}`,
      );
      if (response.error || !response.data?.data) {
        return null;
      }
      return response.data.data;
    };

    const resolveDraft = async () => {
      const hadDraftId = Boolean(draft.formData?.id);
      const resolution = await resolveDraftById({
        draft,
        fetchExisting,
      });

      if (cancelled) return;

      if (resolution.mode === "existing") {
        removeDraft("cohort");
        toast.success("Draft already saved — redirecting to cohort editor.");
        router.replace(`/admin/cohorts/${resolution.draftId}`);
        return;
      }

      if (hadDraftId) {
        showInfoToast(
          "Saved cohort not found — continuing with draft as a new cohort.",
        );
      }

      hydrateDraft(!hadDraftId);
    };

    resolveDraft();

    return () => {
      cancelled = true;
    };
  }, [isEditing, adminFetch, silentFetch, router]);

  // Sync grant failure state from entity props when editing
  useEffect(() => {
    if (isEditing && cohort) {
      setLockManagerGranted(cohort.lock_manager_granted ?? true);
      setGrantFailureReason(cohort.grant_failure_reason ?? undefined);
    }
  }, [isEditing, cohort]);

  // Fetch bootcamp programs on mount only
  useEffect(() => {
    let isMounted = true;

    const fetchBootcampPrograms = async () => {
      try {
        if (!isMounted) return;
        setIsLoadingPrograms(true);

        const result = await adminFetch<{
          success: boolean;
          data: BootcampProgram[];
          error?: string;
        }>("/api/admin/bootcamps");

        if (!isMounted) return;

        if (result.error) {
          throw new Error(result.error);
        }

        if (!result.data?.success) {
          throw new Error(
            result.data?.error || "Failed to load bootcamp programs",
          );
        }

        setBootcampPrograms(result.data.data || []);
      } catch (err: any) {
        if (!isMounted) return;
        log.error("Error fetching bootcamp programs:", err);
        setError(err.message || "Failed to load bootcamp programs");
      } finally {
        if (isMounted) {
          setIsLoadingPrograms(false);
        }
      }
    };

    fetchBootcampPrograms();

    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    let parsedValue: string | number = value;

    // Parse numeric values
    if (
      name === "max_participants" ||
      name === "current_participants" ||
      name === "usdt_amount" ||
      name === "naira_amount"
    ) {
      parsedValue = value === "" ? 0 : parseFloat(value);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
  };

  // Deploy lock for the cohort
  const deployLockForCohort = async (): Promise<
    | {
        lockAddress: string;
        grantFailed?: boolean;
        grantError?: string;
      }
    | undefined
  > => {
    if (!wallet) {
      toast.error("Please connect your wallet to deploy the lock");
      return undefined;
    }

    if (!formData.name) {
      toast.error("Please enter cohort name before deploying lock");
      return undefined;
    }

    setIsDeployingLock(true);
    setDeploymentStep("Checking network...");

    try {
      setDeploymentStep("Preparing lock configuration...");

      // Generate lock config from cohort data
      const lockConfig = generateCohortLockConfig(formData as Cohort);
      const deployConfig = createLockConfigWithManagers(lockConfig);

      // Convert to AdminLockDeploymentParams
      const params = convertLockConfigToDeploymentParams(deployConfig, isAdmin);

      setDeploymentStep("Deploying lock on blockchain...");
      toast.loading("Deploying cohort access lock...", { id: "lock-deploy" });

      // Deploy the lock using admin hook
      const result = await deployAdminLock(params);

      if (!result.success || !result.lockAddress) {
        throw new Error(result.error || "Lock deployment failed");
      }

      setDeploymentStep("Granting server wallet manager role...");

      const lockAddress = result.lockAddress;

      // Check if grant failed
      if (result.grantFailed) {
        setDeploymentStep("Lock deployed but grant manager failed!");
        log.warn("Lock deployed but grant manager transaction failed", {
          lockAddress,
          grantError: result.grantError,
        });
      } else {
        setDeploymentStep("Lock deployed and configured successfully!");
        setLockManagerGranted(true);
        setGrantFailureReason(undefined);
      }

      // Update draft with deployment result to preserve it in case of database failure
      updateDraftWithDeploymentResult("cohort", {
        lockAddress,
        grantFailed: result.grantFailed,
        grantError: result.grantError,
      });

      // Save deployment state before database operation with both transaction hashes
      const deploymentId = savePendingDeployment({
        lockAddress,
        entityType: "cohort",
        entityData: formData,
        transactionHash: result.transactionHash,
        grantTransactionHash: result.grantTransactionHash,
        serverWalletAddress: result.serverWalletAddress,
        blockExplorerUrl: result.transactionHash
          ? getBlockExplorerUrl(result.transactionHash)
          : undefined,
      });

      // Store deployment ID for cleanup on success
      setCurrentDeploymentId(deploymentId);

      if (result.grantFailed) {
        toast(
          <>
            Lock deployed successfully!
            <br />
            ⚠️ Grant manager role failed - you can retry from cohort details
            page.
            <br />
            {result.transactionHash && (
              <a
                href={getBlockExplorerUrl(result.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View deployment
              </a>
            )}
          </>,
          {
            id: "lock-deploy",
            duration: 8000,
            icon: "⚠️",
          },
        );
      } else {
        toast.success(
          <>
            Lock deployed successfully!
            <br />
            Server wallet granted manager role.
            <br />
            {result.transactionHash && (
              <a
                href={getBlockExplorerUrl(result.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View deployment
              </a>
            )}
            {result.grantTransactionHash && (
              <>
                {" | "}
                <a
                  href={getBlockExplorerUrl(result.grantTransactionHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  View grant
                </a>
              </>
            )}
          </>,
          {
            id: "lock-deploy",
            duration: 5000,
          },
        );
      }

      log.info("Lock deployed:", {
        lockAddress,
        transactionHash: result.transactionHash,
        grantTransactionHash: result.grantTransactionHash,
        serverWalletAddress: result.serverWalletAddress,
        deploymentId,
        grantFailed: result.grantFailed,
        grantError: result.grantError,
      });

      return {
        lockAddress,
        grantFailed: result.grantFailed,
        grantError: result.grantError,
      };
    } catch (error: any) {
      log.error("Lock deployment failed:", error);
      const errorMessage = error.message || "Failed to deploy lock";
      toast.error(formatErrorMessageForToast(errorMessage), {
        id: "lock-deploy",
      });
      setDeploymentStep("");
      throw error;
    } finally {
      setIsDeployingLock(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if form is valid before proceeding
    if (!isFormValid) {
      setError("Please fix the validation errors before submitting");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const now = new Date().toISOString();

      // Process key managers from comma-separated string to array
      const keyManagers = keyManagersInput
        .split(",")
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0);

      // Save draft before starting deployment (for new cohorts)
      if (!isEditing) {
        saveDraft("cohort", formData);
      }

      let lockAddress: string | undefined = formData.lock_address || undefined;

      // Deploy lock if not editing and auto-creation is enabled and no lock address provided
      if (!isEditing && showAutoLockCreation && !lockAddress) {
        try {
          log.info("Auto-deploying lock for cohort...");
          const deploymentResult = await deployLockForCohort();

          if (!deploymentResult || !deploymentResult.lockAddress) {
            throw new Error("Lock deployment failed");
          }

          lockAddress = deploymentResult.lockAddress;

          // Track grant failure if it occurred
          if (deploymentResult.grantFailed) {
            setLockManagerGranted(false);
            setGrantFailureReason(
              deploymentResult.grantError || "Grant manager transaction failed",
            );
            log.warn("Cohort will be created with grant failure flag", {
              lockAddress,
              grantError: deploymentResult.grantError,
            });
          }
        } catch (deployError: any) {
          // If lock deployment fails, don't create the cohort
          throw new Error(`Lock deployment failed: ${deployError.message}`);
        }
      }

      // Generate ID for new cohorts
      const cohortId = getRecordId(isEditing, cohort?.id);

      // Remove UI-only fields from formData before sending to database
      const { auto_lock_creation, ...cleanFormData } =
        formData as Partial<Cohort> & {
          auto_lock_creation?: boolean;
        };

      const dataToSave = {
        ...cleanFormData,
        id: cohortId,
        key_managers: keyManagers,
        lock_address: lockAddress,
        lock_manager_granted: lockManagerGranted,
        grant_failure_reason: grantFailureReason,
      };

      const apiUrl = "/api/admin/cohorts";
      const method = isEditing ? "PUT" : "POST";

      const result = await adminFetch(apiUrl, {
        method,
        body: JSON.stringify(
          isEditing
            ? { ...dataToSave, id: cohort!.id }
            : { ...dataToSave, created_at: now, updated_at: now },
        ),
      });

      if (result.error) {
        const err = { error: result.error };

        // Handle specific error cases with better UX
        if (err.error === "Forbidden: User profile not found") {
          setError(
            "Your admin profile needs to be set up. Please contact the system administrator or try logging out and back in.",
          );
        } else if (err.error === "Forbidden: Admins only") {
          setError(
            "You don't have admin permissions. Please contact the system administrator if you believe this is an error.",
          );
        } else if (err.error?.includes("Forbidden")) {
          setError(
            "Access denied. Please ensure you have proper admin permissions.",
          );
        } else {
          throw new Error(err.error || "Failed to save cohort");
        }
      } else {
        // Clean up drafts and pending deployments on success
        if (!isEditing) {
          removeDraft("cohort");

          // Clean up pending deployment if we deployed a lock
          if (currentDeploymentId) {
            removePendingDeployment(currentDeploymentId);
            log.info(`Cleaned up pending deployment: ${currentDeploymentId}`);
          }
        }

        toast.success(
          isEditing
            ? "Cohort updated successfully!"
            : "Cohort created successfully!",
        );

        // Redirect back to cohort list
        router.push("/admin/cohorts");
      }
    } catch (err: any) {
      log.error("Error saving cohort:", err);
      setError(err.message || "Failed to save cohort");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Common input styling for better visibility on dark backgrounds
  const inputClass =
    "bg-transparent border-gray-700 text-gray-100 placeholder-gray-500 focus:border-flame-yellow/50";

  // Special styling for date inputs to make the calendar icon visible
  const dateInputClass = `${inputClass} [color-scheme:dark] cursor-pointer`;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-700 text-red-300 px-4 py-3 rounded">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-300">
                Error creating cohort
              </h3>
              <p className="mt-1 text-sm text-red-200">{error}</p>
              {error.includes("admin") && (
                <div className="mt-2 text-xs text-red-200">
                  <p>If you believe you should have admin access:</p>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Try logging out and logging back in</li>
                    <li>Ensure your wallet is connected properly</li>
                    <li>Contact the system administrator</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {isEditing && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="id" className="text-white">
              Cohort ID
            </Label>
            <div className="mt-1">
              <CopyBadge
                value={formData.id || ""}
                variant="outline"
                className="text-gray-100 border-gray-600 bg-gray-900/50 hover:bg-gray-800 py-1.5 px-3"
              />
            </div>
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="name" className="text-white">
            Cohort Name
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Winter 2024 Cohort"
            required
            className={`${inputClass} ${validationErrors.name ? "border-red-500" : ""}`}
          />
          {validationErrors.name && (
            <p className="text-sm text-red-400 mt-1">{validationErrors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="bootcamp_program_id" className="text-white">
            Bootcamp Program
          </Label>
          <select
            id="bootcamp_program_id"
            name="bootcamp_program_id"
            value={formData.bootcamp_program_id}
            onChange={handleChange}
            required
            disabled={isEditing}
            className={`${inputClass} w-full h-10 rounded-md px-3 ${validationErrors.bootcamp_program_id ? "border-red-500" : ""}`}
          >
            <option value="" disabled>
              {isLoadingPrograms
                ? "Loading bootcamps..."
                : "Select a bootcamp program"}
            </option>
            {bootcampPrograms.map((program) => (
              <option key={program.id} value={program.id}>
                {program.name}
              </option>
            ))}
          </select>
          {validationErrors.bootcamp_program_id && (
            <p className="text-sm text-red-400 mt-1">
              {validationErrors.bootcamp_program_id}
            </p>
          )}
          {isEditing && (
            <p className="text-sm text-gray-400 mt-1">
              Bootcamp program cannot be changed after creation.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="status" className="text-white">
            Status
          </Label>
          <select
            id="status"
            name="status"
            value={formData.status}
            onChange={handleChange}
            required
            className={`${inputClass} w-full h-10 rounded-md px-3`}
          >
            <option value="upcoming">Upcoming</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_date" className="text-white">
            Start Date
          </Label>
          <Input
            id="start_date"
            name="start_date"
            type="date"
            value={formData.start_date}
            onChange={handleChange}
            required
            className={`${dateInputClass} ${validationErrors.start_date ? "border-red-500" : ""}`}
            onClick={(e) => e.currentTarget.showPicker()}
          />
          {validationErrors.start_date && (
            <p className="text-sm text-red-400 mt-1">
              {validationErrors.start_date}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_date" className="text-white">
            End Date
          </Label>
          <Input
            id="end_date"
            name="end_date"
            type="date"
            value={formData.end_date}
            onChange={handleChange}
            required
            className={`${dateInputClass} ${validationErrors.end_date ? "border-red-500" : ""}`}
            onClick={(e) => e.currentTarget.showPicker()}
          />
          {validationErrors.end_date && (
            <p className="text-sm text-red-400 mt-1">
              {validationErrors.end_date}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration_deadline" className="text-white">
            Registration Deadline
          </Label>
          <Input
            id="registration_deadline"
            name="registration_deadline"
            type="date"
            value={formData.registration_deadline}
            onChange={handleChange}
            required
            className={`${dateInputClass} ${validationErrors.registration_deadline ? "border-red-500" : ""}`}
            onClick={(e) => e.currentTarget.showPicker()}
          />
          {validationErrors.registration_deadline && (
            <p className="text-sm text-red-400 mt-1">
              {validationErrors.registration_deadline}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_participants" className="text-white">
            Maximum Participants
          </Label>
          <Input
            id="max_participants"
            name="max_participants"
            type="number"
            value={formData.max_participants}
            onChange={handleChange}
            min={1}
            required
            className={inputClass}
          />
        </div>

        {isEditing && (
          <div className="space-y-2">
            <Label htmlFor="current_participants" className="text-white">
              Current Participants
            </Label>
            <Input
              id="current_participants"
              name="current_participants"
              type="number"
              value={formData.current_participants}
              onChange={handleChange}
              min={0}
              required
              className={inputClass}
            />
          </div>
        )}

        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="lock_address" className="text-white">
              Lock Address
            </Label>
            {!isEditing && !formData.lock_address && (
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="auto_lock_creation"
                  checked={showAutoLockCreation}
                  onChange={(e) => setShowAutoLockCreation(e.target.checked)}
                  className="rounded border-gray-700 bg-transparent text-flame-yellow focus:ring-flame-yellow"
                />
                <Label
                  htmlFor="auto_lock_creation"
                  className="text-sm text-gray-300 cursor-pointer"
                >
                  Auto-create lock
                </Label>
              </div>
            )}
          </div>

          <Input
            id="lock_address"
            name="lock_address"
            value={formData.lock_address}
            onChange={handleChange}
            placeholder={
              showAutoLockCreation && !isEditing
                ? "Will be auto-generated..."
                : "e.g., 0x1234..."
            }
            className={inputClass}
            disabled={showAutoLockCreation && !isEditing}
          />

          {showAutoLockCreation && !isEditing && !formData.lock_address && (
            <p className="text-sm text-blue-400 mt-1">
              ✨ A new lock will be automatically deployed for this cohort using
              your connected wallet
            </p>
          )}

          {!showAutoLockCreation && (
            <p className="text-sm text-gray-400 mt-1">
              Optional: Unlock Protocol lock address for cohort access NFTs
            </p>
          )}

          {isDeployingLock && (
            <div className="bg-blue-900/20 border border-blue-700 text-blue-300 px-3 py-2 rounded mt-2">
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-blue-300/20 border-t-blue-300 rounded-full animate-spin" />
                <span className="text-sm">{deploymentStep}</span>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="key_managers" className="text-white">
            Key Managers Wallets
          </Label>
          <Input
            id="key_managers"
            name="key_managers"
            value={keyManagersInput}
            onChange={(e) => setKeyManagersInput(e.target.value)}
            placeholder="e.g., 0xabc..., 0xdef..., 0x123..."
            className={inputClass}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Comma-separated list of wallet addresses for key managers
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="usdt_amount" className="text-white">
            USDT Amount
          </Label>
          <Input
            id="usdt_amount"
            name="usdt_amount"
            type="number"
            step="0.01"
            value={formData.usdt_amount}
            onChange={handleChange}
            min={0}
            placeholder="0.00"
            className={`${inputClass} ${validationErrors.usdt_amount ? "border-red-500" : ""}`}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Cohort price in USDT
          </p>
          {validationErrors.usdt_amount && (
            <p className="text-sm text-red-400 mt-1">
              {validationErrors.usdt_amount}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="naira_amount" className="text-white">
            Naira Amount
          </Label>
          <Input
            id="naira_amount"
            name="naira_amount"
            type="number"
            step="0.01"
            value={formData.naira_amount}
            onChange={handleChange}
            min={0}
            placeholder="0.00"
            className={`${inputClass} ${validationErrors.naira_amount ? "border-red-500" : ""}`}
          />
          <p className="text-sm text-gray-400 mt-1">
            Optional: Cohort price in Naira
          </p>
          {validationErrors.naira_amount && (
            <p className="text-sm text-red-400 mt-1">
              {validationErrors.naira_amount}
            </p>
          )}
        </div>
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <Button
          type="button"
          variant="outline"
          className="border-gray-700 text-white hover:bg-gray-800"
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !isFormValid || isDeployingFromHook}
          className="bg-steel-red hover:bg-steel-red/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting || isDeployingFromHook ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
              {isDeployingFromHook
                ? "Deploying Lock..."
                : isEditing
                  ? "Updating..."
                  : "Creating..."}
            </>
          ) : (
            <>{isEditing ? "Update Cohort" : "Create Cohort"}</>
          )}
        </Button>
      </div>
    </form>
  );
}

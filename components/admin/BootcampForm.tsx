import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyBadge } from "@/components/ui/badge";
import { useSmartWalletSelection } from "@/hooks/useSmartWalletSelection";
import { toast } from "react-hot-toast";
import {
  formatErrorMessageForToast,
  showInfoToast,
} from "@/lib/utils/toast-utils";
import {
  generateBootcampLockConfig,
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
  hasPendingDeployments,
} from "@/lib/utils/lock-deployment-state";
import { resolveDraftById } from "@/lib/utils/draft";
import { getRecordId } from "@/lib/utils/id-generation";

import ImageUpload from "@/components/ui/image-upload";
import type { BootcampProgram } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { AuthError } from "@/components/ui/auth-error";
import { getLogger } from "@/lib/utils/logger";
import { useDeployAdminLock } from "@/hooks/unlock/useDeployAdminLock";
import { useAdminAuthContext } from "@/contexts/admin-context";
import { convertLockConfigToDeploymentParams } from "@/lib/blockchain/shared/lock-config-converter";
import {
  applyDeploymentOutcome,
  effectiveGrantForSave,
} from "@/lib/blockchain/shared/grant-state";
import LockManagerToggle from "@/components/admin/LockManagerToggle";
import { useLockManagerState } from "@/hooks/useLockManagerState";

const log = getLogger("admin:BootcampForm");

interface BootcampFormProps {
  bootcamp?: BootcampProgram;
  isEditing?: boolean;
  onSuccess?: () => void;
}

export default function BootcampForm({
  bootcamp,
  isEditing = false,
  onSuccess,
}: BootcampFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallet = useSmartWalletSelection();

  const { adminFetch, error: adminApiError } = useAdminApi({
    redirectOnAuthError: false,
    showAuthErrorModal: true,
  });
  const { adminFetch: silentFetch } = useAdminApi({ suppressToasts: true });

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
  const [hasPendingBootcampDeployments, setHasPendingBootcampDeployments] =
    useState(false);
  // Use the reusable hook for lock manager state management
  const {
    lockManagerGranted,
    setLockManagerGranted,
    grantFailureReason,
    setGrantFailureReason,
  } = useLockManagerState(isEditing, bootcamp);
  // Track the most recent grant outcome during submit to avoid async state races
  let lastGrantFailed: boolean | undefined;
  let lastGrantError: string | undefined;

  // Keep track of the original bootcamp ID for updates
  const [originalBootcampId, setOriginalBootcampId] = useState<string | null>(
    null,
  );

  // Initialize form data and original ID
  useEffect(() => {
    if (bootcamp) {
      setFormData(bootcamp);
      setOriginalBootcampId(bootcamp.id);
      log.info("Initialized with bootcamp ID:", bootcamp.id);
    }
  }, [bootcamp]);

  const [formData, setFormData] = useState<Partial<BootcampProgram>>(
    bootcamp || {
      name: "",
      description: "",
      duration_weeks: 4,
      max_reward_dgt: 0,
      lock_address: "", // Using existing lock_address field from DB
      image_url: "",
    },
  );

  // Load draft data on mount and check for pending deployments
  useEffect(() => {
    if (isEditing) return;

    const draft = getDraft("bootcamp");
    const hasPending = hasPendingDeployments("bootcamp");
    setHasPendingBootcampDeployments(hasPending);

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
      const response = await silentFetch<{
        success: boolean;
        data?: BootcampProgram;
      }>(`/api/admin/bootcamps/${id}`);
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
        removeDraft("bootcamp");
        toast.success("Draft already saved — redirecting to bootcamp editor.");
        router.replace(`/admin/bootcamps/${resolution.draftId}`);
        return;
      }

      if (hadDraftId) {
        showInfoToast(
          "Saved bootcamp not found — continuing with draft as a new bootcamp.",
        );
      }

      hydrateDraft(!hadDraftId);
    };

    resolveDraft();

    return () => {
      cancelled = true;
    };
  }, [isEditing, adminFetch, silentFetch, router]);

  // Clear local error when adminApi error is cleared
  useEffect(() => {
    if (!adminApiError) {
      setError(null);
    }
  }, [adminApiError]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    let parsedValue: string | number = value;

    // Parse numeric values
    if (name === "duration_weeks" || name === "max_reward_dgt") {
      parsedValue = value === "" ? 0 : parseInt(value, 10);
    }

    setFormData((prev) => ({
      ...prev,
      [name]: parsedValue,
    }));
  };

  const handleImageChange = (imageUrl: string | null) => {
    setFormData((prev) => ({
      ...prev,
      image_url: imageUrl || "",
    }));
  };

  // Deploy lock for the bootcamp
  const deployLockForBootcamp = async (): Promise<
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
      toast.error("Please enter bootcamp name before deploying lock");
      return undefined;
    }

    setIsDeployingLock(true);
    setDeploymentStep("Checking network...");

    try {
      setDeploymentStep("Preparing lock configuration...");

      // Generate lock config from bootcamp data
      const lockConfig = generateBootcampLockConfig(
        formData as BootcampProgram,
      );
      const deployConfig = createLockConfigWithManagers(lockConfig);

      // Convert to AdminLockDeploymentParams
      const params = convertLockConfigToDeploymentParams(deployConfig, isAdmin);

      setDeploymentStep("Deploying lock on blockchain...");
      toast.loading("Deploying bootcamp certificate lock...", {
        id: "lock-deploy",
      });

      // Deploy the lock using admin hook
      const result = await deployAdminLock(params);

      if (!result.success || !result.lockAddress) {
        throw new Error(result.error || "Lock deployment failed");
      }

      setDeploymentStep("Granting server wallet manager role...");

      const lockAddress = result.lockAddress;

      // Check grant result
      const outcome = applyDeploymentOutcome(result);
      if (outcome.lastGrantFailed) {
        setDeploymentStep("Lock deployed but grant manager failed!");
      } else {
        setDeploymentStep("Lock deployed and configured successfully!");
      }
      setLockManagerGranted(outcome.granted);
      setGrantFailureReason(outcome.reason);
      lastGrantFailed = outcome.lastGrantFailed;
      lastGrantError = outcome.lastGrantError;
      if (outcome.lastGrantFailed) {
        log.warn("Lock deployed but grant manager transaction failed", {
          lockAddress,
          grantError: outcome.lastGrantError,
        });
      }

      // Update draft with deployment result to preserve it in case of database failure
      updateDraftWithDeploymentResult("bootcamp", {
        lockAddress,
        grantFailed: result.grantFailed,
        grantError: result.grantError,
      });

      // Save deployment state before database operation with both transaction hashes
      const deploymentId = savePendingDeployment({
        lockAddress,
        entityType: "bootcamp",
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
            ⚠️ Grant manager role failed - you can retry from bootcamp details
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
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.name || !formData.description) {
        throw new Error("Please fill in all required fields");
      }

      if (formData.duration_weeks! < 1) {
        throw new Error("Duration must be at least 1 week");
      }

      // Save draft before starting deployment (for new bootcamps)
      if (!isEditing) {
        saveDraft("bootcamp", formData);
      }

      let lockAddress: string | undefined = formData.lock_address || undefined;

      // Deploy lock if not editing and auto-creation is enabled and no lock address provided
      if (!isEditing && showAutoLockCreation && !lockAddress) {
        try {
          log.info("Auto-deploying lock for bootcamp...");
          const deploymentResult = await deployLockForBootcamp();

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
            log.warn("Bootcamp will be created with grant failure flag", {
              lockAddress,
              grantError: deploymentResult.grantError,
            });
          }
        } catch (deployError: any) {
          // If lock deployment fails, don't create the bootcamp
          throw new Error(`Lock deployment failed: ${deployError.message}`);
        }
      }

      // Generate ID for new bootcamps
      const bootcampId = getRecordId(
        isEditing,
        originalBootcampId || undefined,
      );

      // Prepare submission data for API
      // Use effective values for this submit to avoid relying on async state updates
      const effective = effectiveGrantForSave({
        outcome: { lastGrantFailed, lastGrantError },
        lockAddress,
        currentGranted: lockManagerGranted,
        currentReason: grantFailureReason,
      });

      const apiData: any = {
        id: bootcampId, // Always include ID
        name: formData.name,
        description: formData.description,
        duration_weeks: formData.duration_weeks,
        max_reward_dgt: formData.max_reward_dgt,
        lock_address: lockAddress || null,
        image_url: formData.image_url || null,
        lock_manager_granted: effective.granted,
        grant_failure_reason: effective.reason,
        updated_at: new Date().toISOString(),
      };

      // Add created_at for new bootcamps
      if (!isEditing) {
        apiData.created_at = new Date().toISOString();
      }

      const endpoint = "/api/admin/bootcamps";
      const method = isEditing ? "PUT" : "POST";

      const response = await adminFetch<{
        success: boolean;
        data?: BootcampProgram;
        error?: string;
      }>(endpoint, {
        method,
        body: JSON.stringify(apiData),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (!response.data?.success || !response.data.data) {
        throw new Error(response.data?.error || "Failed to save bootcamp");
      }

      if (response.data.data) {
        // Clean up drafts and pending deployments on success
        if (!isEditing) {
          removeDraft("bootcamp");

          // Clean up pending deployment if we deployed a lock
          if (currentDeploymentId) {
            removePendingDeployment(currentDeploymentId);
            log.info(`Cleaned up pending deployment: ${currentDeploymentId}`);
          }
        }

        toast.success(
          isEditing
            ? "Bootcamp updated successfully!"
            : "Bootcamp created successfully!",
        );

        if (isEditing && onSuccess) {
          // For editing, call success callback to refresh data
          onSuccess();
        } else {
          // For creating, redirect to bootcamp list
          router.push("/admin/bootcamps");
        }
      }
    } catch (error: any) {
      log.error("Error saving bootcamp:", error);
      setError(error.message || "Failed to save bootcamp");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Common input styling for better visibility on dark backgrounds
  const inputClass =
    "bg-transparent border-gray-700 text-gray-100 placeholder-gray-500 focus:border-flame-yellow/50";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <AuthError
        error={error}
        onClear={() => setError(null)}
        className="mb-4"
      />

      {/* Pending Deployments Warning */}
      {hasPendingBootcampDeployments && !isEditing && (
        <div className="bg-yellow-900/20 border border-yellow-700 text-yellow-300 px-4 py-3 rounded-lg">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="font-medium">
                Pending bootcamp deployments detected
              </p>
              <p className="text-sm mt-1">
                There are unfinished bootcamp deployments with orphaned locks.
                <Link
                  href="/admin/draft-recovery"
                  className="underline ml-1 hover:text-yellow-200"
                >
                  Visit Draft Recovery →
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {isEditing && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="id" className="text-white">
              Bootcamp ID
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
            Bootcamp Name
          </Label>
          <Input
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Ethereum for Everyone: Learn and Build Season 2"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="description" className="text-white">
            Description
          </Label>
          <Textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={4}
            placeholder="Enter bootcamp description"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="duration_weeks" className="text-white">
            Duration (weeks)
          </Label>
          <Input
            id="duration_weeks"
            name="duration_weeks"
            type="number"
            value={formData.duration_weeks}
            onChange={handleChange}
            min={1}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_reward_dgt" className="text-white">
            Max Reward (DGT)
          </Label>
          <Input
            id="max_reward_dgt"
            name="max_reward_dgt"
            type="number"
            value={formData.max_reward_dgt}
            onChange={handleChange}
            min={0}
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="lock_address" className="text-white">
              Certificate Lock Address
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

          {/* Lock Manager Status Toggle */}
          <LockManagerToggle
            isGranted={lockManagerGranted}
            onToggle={setLockManagerGranted}
            lockAddress={formData.lock_address}
            isEditing={isEditing}
          />

          {showAutoLockCreation && !isEditing && !formData.lock_address && (
            <p className="text-sm text-blue-400 mt-1">
              ✨ A new certificate lock will be automatically deployed for this
              bootcamp using your connected wallet
            </p>
          )}

          {!showAutoLockCreation && (
            <p className="text-sm text-gray-400 mt-1">
              Optional: Unlock Protocol lock address for bootcamp completion
              certificates
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
          <ImageUpload
            value={formData.image_url}
            onChange={handleImageChange}
            disabled={isSubmitting}
          />
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
          disabled={isSubmitting || isDeployingFromHook}
          className="bg-steel-red hover:bg-steel-red/90 text-white"
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
            <>{isEditing ? "Update Bootcamp" : "Create Bootcamp"}</>
          )}
        </Button>
      </div>
    </form>
  );
}

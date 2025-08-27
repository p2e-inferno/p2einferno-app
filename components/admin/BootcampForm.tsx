import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyBadge } from "@/components/ui/badge";
import { useSmartWalletSelection } from "../../hooks/useSmartWalletSelection";
import { toast } from "react-hot-toast";
import { unlockUtils } from "@/lib/unlock/lockUtils";
import { generateBootcampLockConfig, createLockConfigWithManagers } from "@/lib/blockchain/admin-lock-config";
import { getBlockExplorerUrl } from "@/lib/blockchain/transaction-helpers";
import { 
  saveDraft, 
  removeDraft, 
  getDraft, 
  savePendingDeployment,
  removePendingDeployment,
  hasPendingDeployments
} from "@/lib/utils/lock-deployment-state";
import { getRecordId } from "@/lib/utils/id-generation";

import ImageUpload from "@/components/ui/image-upload";
import type { BootcampProgram } from "@/lib/supabase/types";
import { useAdminApi } from "@/hooks/useAdminApi";
import { AuthError } from "@/components/ui/auth-error";

interface BootcampFormProps {
  bootcamp?: BootcampProgram;
  isEditing?: boolean;
}

export default function BootcampForm({
  bootcamp,
  isEditing = false,
}: BootcampFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallet = useSmartWalletSelection();

  const adminApi = useAdminApi({
    redirectOnAuthError: false,
    showAuthErrorModal: true,
  });
  
  // Lock deployment state
  const [isDeployingLock, setIsDeployingLock] = useState(false);
  const [deploymentStep, setDeploymentStep] = useState<string>("");
  const [showAutoLockCreation, setShowAutoLockCreation] = useState(true);
  const [currentDeploymentId, setCurrentDeploymentId] = useState<string | null>(null);
  const [hasPendingBootcampDeployments, setHasPendingBootcampDeployments] = useState(false);

  // Keep track of the original bootcamp ID for updates
  const [originalBootcampId, setOriginalBootcampId] = useState<string | null>(
    null
  );

  // Initialize form data and original ID
  useEffect(() => {
    if (bootcamp) {
      setFormData(bootcamp);
      setOriginalBootcampId(bootcamp.id);
      console.log("Initialized with bootcamp ID:", bootcamp.id);
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
    }
  );

  // Load draft data on mount and check for pending deployments
  useEffect(() => {
    if (!isEditing) {
      const draft = getDraft('bootcamp');
      if (draft) {
        setFormData(prev => ({ ...prev, ...draft.formData }));
        toast.success("Restored draft data");
      }
      
      // Check for pending deployments
      const hasPending = hasPendingDeployments('bootcamp');
      setHasPendingBootcampDeployments(hasPending);
    }
  }, [isEditing]);

  // Clear local error when adminApi error is cleared
  useEffect(() => {
    if (!adminApi.error) {
      setError(null);
    }
  }, [adminApi.error]);



  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
  const deployLockForBootcamp = async (): Promise<string | undefined> => {
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
      const lockConfig = generateBootcampLockConfig(formData as BootcampProgram);
      const deployConfig = createLockConfigWithManagers(lockConfig);
      
      setDeploymentStep("Deploying lock on blockchain...");
      toast.loading("Deploying bootcamp certificate lock...", { id: "lock-deploy" });

      // Deploy the lock
      const result = await unlockUtils.deployLock(deployConfig, wallet);

      if (!result.success) {
        throw new Error(result.error || "Lock deployment failed");
      }

      // Get lock address from deployment result
      if (!result.lockAddress) {
        throw new Error("Lock deployment succeeded but no lock address returned");
      }

      const lockAddress = result.lockAddress;
      setDeploymentStep("Lock deployed successfully!");

      // Save deployment state before database operation
      const deploymentId = savePendingDeployment({
        lockAddress,
        entityType: 'bootcamp',
        entityData: formData,
        transactionHash: result.transactionHash,
        blockExplorerUrl: result.transactionHash ? getBlockExplorerUrl(result.transactionHash) : undefined,
      });

      // Store deployment ID for cleanup on success
      setCurrentDeploymentId(deploymentId);

      toast.success(
        <>
          Lock deployed successfully!
          <br />
          {result.transactionHash && (
            <a 
              href={getBlockExplorerUrl(result.transactionHash)} 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline"
            >
              View transaction
            </a>
          )}
        </>,
        { 
          id: "lock-deploy",
          duration: 5000 
        }
      );

      console.log("Lock deployed:", {
        lockAddress,
        transactionHash: result.transactionHash,
        deploymentId,
      });

      return lockAddress;

    } catch (error: any) {
      console.error("Lock deployment failed:", error);
      toast.error(error.message || "Failed to deploy lock", { id: "lock-deploy" });
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
        saveDraft('bootcamp', formData);
      }

      let lockAddress: string | undefined = formData.lock_address || undefined;

      // Deploy lock if not editing and auto-creation is enabled and no lock address provided
      if (!isEditing && showAutoLockCreation && !lockAddress) {
        try {
          console.log("Auto-deploying lock for bootcamp...");
          lockAddress = await deployLockForBootcamp();
          
          if (!lockAddress) {
            throw new Error("Lock deployment failed");
          }
        } catch (deployError: any) {
          // If lock deployment fails, don't create the bootcamp
          throw new Error(`Lock deployment failed: ${deployError.message}`);
        }
      }

      // Generate ID for new bootcamps
      const bootcampId = getRecordId(isEditing, originalBootcampId || undefined);

      // Prepare submission data for API
      const apiData: any = {
        id: bootcampId, // Always include ID
        name: formData.name,
        description: formData.description,
        duration_weeks: formData.duration_weeks,
        max_reward_dgt: formData.max_reward_dgt,
        lock_address: lockAddress || null,
        image_url: formData.image_url || null,
        updated_at: new Date().toISOString(),
      };

      // Add created_at for new bootcamps
      if (!isEditing) {
        apiData.created_at = new Date().toISOString();
      }

      const endpoint = "/api/admin/bootcamps";
      const method = isEditing ? "PUT" : "POST";

      const response = await adminApi.adminFetch(endpoint, {
        method,
        body: JSON.stringify(apiData),
      });

      if (response.error) {
        throw new Error(response.error);
      }

      if (response.data) {
        // Clean up drafts and pending deployments on success
        if (!isEditing) {
          removeDraft('bootcamp');
          
          // Clean up pending deployment if we deployed a lock
          if (currentDeploymentId) {
            removePendingDeployment(currentDeploymentId);
            console.log(`Cleaned up pending deployment: ${currentDeploymentId}`);
          }
        }
        
        toast.success(isEditing ? "Bootcamp updated successfully!" : "Bootcamp created successfully!");
        
        // Redirect back to bootcamp list
        router.push("/admin/bootcamps");
      }
    } catch (error: any) {
      console.error("Error saving bootcamp:", error);
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
              <p className="font-medium">Pending bootcamp deployments detected</p>
              <p className="text-sm mt-1">
                There are unfinished bootcamp deployments with orphaned locks. 
                <Link href="/admin/draft-recovery" className="underline ml-1 hover:text-yellow-200">
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
                <Label htmlFor="auto_lock_creation" className="text-sm text-gray-300 cursor-pointer">
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
            placeholder={showAutoLockCreation && !isEditing ? "Will be auto-generated..." : "e.g., 0x1234..."}
            className={inputClass}
            disabled={showAutoLockCreation && !isEditing}
          />
          
          {showAutoLockCreation && !isEditing && !formData.lock_address && (
            <p className="text-sm text-blue-400 mt-1">
              ✨ A new certificate lock will be automatically deployed for this bootcamp using your connected wallet
            </p>
          )}
          
          {!showAutoLockCreation && (
            <p className="text-sm text-gray-400 mt-1">
              Optional: Unlock Protocol lock address for bootcamp completion certificates
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
          disabled={isSubmitting}
          className="bg-steel-red hover:bg-steel-red/90 text-white"
        >
          {isSubmitting ? (
            <>
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"></div>
              {isEditing ? "Updating..." : "Creating..."}
            </>
          ) : (
            <>{isEditing ? "Update Bootcamp" : "Create Bootcamp"}</>
          )}
        </Button>
      </div>
    </form>
  );
}

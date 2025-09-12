import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import { usePrivy } from "@privy-io/react-auth";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("ui:image-upload");

interface ImageUploadProps {
  value?: string;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  bucketName?: string;
  maxSizeMB?: number;
}

export default function ImageUpload({
  value,
  onChange,
  disabled = false,
  bucketName = "bootcamp-images",
  maxSizeMB = 5,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { getAccessToken } = usePrivy();

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateFile = (file: File): string | null => {
    // Check file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return "Please upload a valid image file (JPEG, PNG, WebP, or GIF)";
    }

    // Check file size
    if (file.size > maxSizeBytes) {
      return `File size must be less than ${maxSizeMB}MB`;
    }

    return null;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === "string") {
          // Remove the data URL prefix to get just the base64 data
          const parts = reader.result.split(",");
          const base64 = parts[1];
          if (base64) {
            resolve(base64);
          } else {
            reject(new Error("Failed to read file"));
          }
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const uploadFile = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);

    try {
      // Get access token for authentication
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      // Convert file to base64
      const base64Data = await fileToBase64(file);

      // Upload via API
      const response = await fetch("/api/admin/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          file: base64Data,
          fileName: file.name,
          contentType: file.type,
          bucketName: bucketName,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload image");
      }

      const result = await response.json();
      onChange(result.url);
    } catch (error: any) {
      log.error("Upload error:", error);
      setErrorMsg(error.message || "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (file) {
      uploadFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (disabled || isUploading) return;

    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  const removeImage = async () => {
    if (!value) return;

    try {
      // Get access token for authentication
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authentication required");
      }

      // Delete via API
      await fetch("/api/admin/images", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: value,
          bucketName: bucketName,
        }),
      });

      // Update form state regardless of API success
      onChange("");
    } catch (error) {
      log.error("Error removing image:", error);
      // Still remove from form even if API deletion fails
      onChange("");
    }
  };

  return (
    <div className="space-y-4">
      {/* Error Modal */}
      {errorMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md text-center space-y-4">
            <h3 className="text-lg font-semibold text-white">Upload Error</h3>
            <p className="text-gray-300">{errorMsg}</p>
            <Button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="bg-steel-red hover:bg-steel-red/90 text-white"
            >
              Close
            </Button>
          </div>
        </div>
      )}

      <Label className="text-white">Bootcamp Image</Label>

      {value ? (
        <div className="relative">
          <Image
            src={value}
            alt="Bootcamp image"
            width={400}
            height={192}
            className="w-full h-48 object-cover rounded-lg border border-gray-700"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 border-red-600"
            onClick={removeImage}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragActive
              ? "border-flame-yellow bg-flame-yellow/10"
              : "border-gray-600 hover:border-gray-500"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() =>
            !disabled && !isUploading && fileInputRef.current?.click()
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            disabled={disabled || isUploading}
          />

          <div className="flex flex-col items-center space-y-3">
            {isUploading ? (
              <>
                <div className="w-8 h-8 border-4 border-flame-yellow/20 border-t-flame-yellow rounded-full animate-spin" />
                <p className="text-gray-400">Uploading...</p>
              </>
            ) : (
              <>
                <ImageIcon className="w-8 h-8 text-gray-400" />
                <div>
                  <p className="text-gray-300">
                    <span className="font-medium">Click to upload</span> or drag
                    and drop
                  </p>
                  <p className="text-sm text-gray-500">
                    PNG, JPG, WebP or GIF up to {maxSizeMB}MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-gray-700 text-gray-300 hover:bg-gray-800"
                  disabled={disabled}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Choose File
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useRef, useState, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import Image from "next/image";
import { X, Download, Loader2 } from "lucide-react";
import {
  CertificateTemplate,
  type CertificateData,
} from "./CertificateTemplate";
import {
  generateCertificate,
  downloadCertificate,
  generateCertificateFilename,
  generateAndSaveCertificate,
} from "@/lib/certificate/generator";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("components:CertificatePreviewModal");

interface CertificatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificateData?: CertificateData;
  storedImageUrl?: string;
  isClaimed?: boolean;
  enrollmentId?: string;
}

export const CertificatePreviewModal: React.FC<
  CertificatePreviewModalProps
> = ({
  open,
  onOpenChange,
  certificateData,
  storedImageUrl,
  isClaimed = false,
  enrollmentId,
}) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [autoSaveAttempted, setAutoSaveAttempted] = useState(false);
  const [autoSaveSucceeded, setAutoSaveSucceeded] = useState(false);

  const handleGeneratePreview = useCallback(async () => {
    if (!certificateRef.current || !certificateData) return;

    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateCertificate({
        data: certificateData,
        element: certificateRef.current,
      });

      setGeneratedImage(result.dataUrl);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate preview",
      );
    } finally {
      setIsGenerating(false);
    }
  }, [certificateData]);

  const handleDownload = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // If we have a stored image URL, download it directly
      if (storedImageUrl && isClaimed) {
        const response = await fetch(generatedImage || storedImageUrl);
        const blob = await response.blob();

        const filename = certificateData
          ? generateCertificateFilename(
              certificateData.bootcampName,
              certificateData.userName,
            )
          : "certificate.png";

        downloadCertificate(blob, filename);
        return;
      }

      // Otherwise generate a new certificate
      if (!certificateRef.current || !certificateData) return;

      const result = await generateCertificate({
        data: certificateData,
        element: certificateRef.current,
      });

      const filename = generateCertificateFilename(
        certificateData.bootcampName,
        certificateData.userName,
      );

      downloadCertificate(result.blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download");
    } finally {
      setIsGenerating(false);
    }
  };

  // Save certificate using reusable function
  const handleSaveCertificate = useCallback(async () => {
    if (!enrollmentId || !certificateRef.current || !certificateData) {
      log.warn("Missing data for certificate save", {
        enrollmentId,
        hasElement: !!certificateRef.current,
        hasCertData: !!certificateData,
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await generateAndSaveCertificate({
        enrollmentId,
        certificateData,
        element: certificateRef.current,
      });

      if (result.success) {
        log.info("Certificate saved successfully", {
          enrollmentId,
          imageUrl: result.imageUrl,
        });
        setError(null);
        setAutoSaveSucceeded(true);
      } else {
        log.error("Failed to save certificate", { error: result.error });
        setError(
          result.error || "Failed to save certificate. Please try again.",
        );
        setAutoSaveSucceeded(false);
      }
    } catch (error) {
      log.error("Certificate save error", { error });
      setError("Failed to save certificate. Please try again.");
      setAutoSaveSucceeded(false);
    } finally {
      setIsSaving(false);
    }
  }, [enrollmentId, certificateData]);

  // Auto-save certificate after generation (for claimed certificates)
  React.useEffect(() => {
    // Trigger auto-save when:
    // 1. Certificate is claimed
    // 2. We have a generated image (from client-side generation)
    // 3. We don't have a stored image URL yet
    // 4. We have an enrollmentId
    // 5. Auto-save hasn't been attempted yet
    if (
      isClaimed &&
      generatedImage &&
      !storedImageUrl &&
      enrollmentId &&
      !autoSaveAttempted &&
      !isSaving
    ) {
      log.info("Triggering auto-save for certificate", { enrollmentId });
      setAutoSaveAttempted(true);
      handleSaveCertificate();
    }
  }, [
    isClaimed,
    generatedImage,
    storedImageUrl,
    enrollmentId,
    autoSaveAttempted,
    isSaving,
    handleSaveCertificate,
  ]);

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setError(null);
      setAutoSaveAttempted(false);
      setAutoSaveSucceeded(false);

      // If we have a stored image and it's claimed, use that
      if (storedImageUrl && isClaimed) {
        setGeneratedImage(storedImageUrl);
        setIsGenerating(false);
        setAutoSaveSucceeded(true); // Already saved
      } else if (certificateData) {
        // Generate preview automatically when modal opens
        setGeneratedImage(null);
        setTimeout(() => {
          handleGeneratePreview();
        }, 100);
      } else {
        setError("No certificate data available");
      }
    }
  }, [open, storedImageUrl, isClaimed, certificateData, handleGeneratePreview]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[95vw] max-w-6xl translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-gray-900 p-6 shadow-xl border border-gray-800 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-2xl font-bold text-white">
              {isClaimed ? "Certificate" : "Certificate Preview"}
            </Dialog.Title>
            <Dialog.Close className="rounded-full p-2 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </div>

          {/* Certificate Preview */}
          <div className="mb-6">
            {isGenerating && !generatedImage && (
              <div className="flex items-center justify-center h-[500px] bg-gray-800 rounded-lg">
                <div className="text-center">
                  <Loader2 className="h-12 w-12 text-flame-yellow animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Generating preview...</p>
                </div>
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg text-red-400 mb-4">
                {error}
              </div>
            )}

            {generatedImage && !isGenerating && (
              <div className="bg-gray-800 rounded-lg p-4 overflow-auto">
                <Image
                  src={generatedImage}
                  alt="Certificate Preview"
                  width={1200}
                  height={800}
                  className="mx-auto max-w-full h-auto rounded shadow-2xl"
                  unoptimized
                />
              </div>
            )}
          </div>

          {/* Hidden certificate template for rendering */}
          {certificateData && (
            <div className="absolute -left-[9999px] -top-[9999px]">
              <CertificateTemplate
                data={certificateData}
                innerRef={certificateRef}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            {/* Only show regenerate for previews, not for claimed certificates */}
            {!isClaimed && certificateData && (
              <button
                onClick={handleGeneratePreview}
                disabled={isGenerating}
                className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </span>
                ) : (
                  "Regenerate"
                )}
              </button>
            )}

            {/* Show save button ONLY if auto-save failed (as fallback) */}
            {isClaimed &&
              !storedImageUrl &&
              generatedImage &&
              enrollmentId &&
              autoSaveAttempted &&
              !autoSaveSucceeded && (
                <button
                  onClick={handleSaveCertificate}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Retrying...
                    </span>
                  ) : (
                    "Retry Save"
                  )}
                </button>
              )}

            <button
              onClick={handleDownload}
              disabled={isGenerating || !generatedImage}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-flame-yellow to-flame-orange text-gray-900 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download Certificate
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

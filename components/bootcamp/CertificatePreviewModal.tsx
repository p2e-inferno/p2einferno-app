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
} from "@/lib/certificate/generator";

interface CertificatePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  certificateData: CertificateData;
}

export const CertificatePreviewModal: React.FC<
  CertificatePreviewModalProps
> = ({ open, onOpenChange, certificateData }) => {
  const certificateRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGeneratePreview = useCallback(async () => {
    if (!certificateRef.current) return;

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
    if (!certificateRef.current) return;

    setIsGenerating(true);
    setError(null);

    try {
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

  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setGeneratedImage(null);
      setError(null);
      // Generate preview automatically when modal opens
      setTimeout(() => {
        handleGeneratePreview();
      }, 100);
    }
  }, [open, handleGeneratePreview]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-50 max-h-[90vh] w-[95vw] max-w-6xl translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-lg bg-gray-900 p-6 shadow-xl border border-gray-800 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-2xl font-bold text-white">
              Certificate Preview
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
          <div className="absolute -left-[9999px] -top-[9999px]">
            <CertificateTemplate
              data={certificateData}
              innerRef={certificateRef}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
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

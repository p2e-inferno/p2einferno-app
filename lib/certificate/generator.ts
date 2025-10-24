import { toPng } from "html-to-image";
import type { CertificateData } from "@/components/bootcamp/CertificateTemplate";
import { createClient } from "@/lib/supabase/client";
import { getLogger } from "@/lib/utils/logger";

const log = getLogger("lib:certificate:generator");

export interface GenerateCertificateOptions {
  /**
   * The certificate data to render
   */
  data: CertificateData;
  /**
   * The HTML element containing the certificate template
   */
  element: HTMLElement;
  /**
   * Quality of the generated image (0-1, default: 1)
   */
  quality?: number;
}

export interface GenerateCertificateResult {
  /**
   * Base64 data URL of the generated certificate image
   */
  dataUrl: string;
  /**
   * Blob of the certificate image for downloading
   */
  blob: Blob;
}

/**
 * Generates a certificate image from the CertificateTemplate component
 */
export async function generateCertificate(
  options: GenerateCertificateOptions,
): Promise<GenerateCertificateResult> {
  const { element, quality = 1 } = options;

  try {
    // Generate PNG with high quality
    // Skip font embedding to avoid CORS errors when reading cross-origin stylesheets
    // Certificate uses system fonts (system-ui, -apple-system, sans-serif) so this is safe
    const dataUrl = await toPng(element, {
      quality,
      pixelRatio: 2, // Higher resolution for better quality
      cacheBust: true, // Prevent caching issues
      skipAutoScale: true, // Maintain exact dimensions
      skipFonts: true, // Avoid CORS errors from reading Google Fonts stylesheets
    });

    // Convert data URL to blob for downloading
    // Direct conversion without fetch() to avoid CSP connect-src restrictions
    const parts = dataUrl.split(",");
    if (parts.length !== 2 || !parts[1]) {
      throw new Error("Invalid data URL format");
    }
    const base64Data = parts[1];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: "image/png" });

    return {
      dataUrl,
      blob,
    };
  } catch (error) {
    throw new Error(
      `Failed to generate certificate: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Downloads the certificate image
 */
export function downloadCertificate(
  blob: Blob,
  fileName: string = "certificate.png",
): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates a filename for the certificate based on bootcamp name and date
 */
export function generateCertificateFilename(
  bootcampName: string,
  userName: string,
): string {
  const sanitizedBootcamp = bootcampName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const sanitizedUser = userName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const timestamp = new Date().toISOString().split("T")[0];

  return `${sanitizedBootcamp}-certificate-${sanitizedUser}-${timestamp}.png`;
}

export interface GenerateAndSaveCertificateParams {
  enrollmentId: string;
  certificateData: CertificateData;
  element: HTMLElement;
}

export interface TryAutoSaveCertificateParams {
  cohortId: string;
}

export interface GenerateAndSaveCertificateResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * Generates certificate image, uploads to storage, and saves URL to database
 * Reusable function for both auto-save and retry save flows
 */
export async function generateAndSaveCertificate(
  params: GenerateAndSaveCertificateParams,
): Promise<GenerateAndSaveCertificateResult> {
  const { enrollmentId, certificateData, element } = params;

  try {
    log.info("Starting certificate generation and save", { enrollmentId });

    // 1. Generate certificate image
    const { dataUrl } = await generateCertificate({
      data: certificateData,
      element,
    });

    // 2. Convert data URL to blob (avoid CSP violation)
    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) {
      return { success: false, error: "Invalid data URL format" };
    }
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'image/png' });

    // 3. Upload to Supabase Storage
    const fileName = `${enrollmentId}-${Date.now()}.png`;
    const supabase = createClient();

    const { error: uploadError } = await supabase.storage
      .from("certificates")
      .upload(fileName, blob, {
        contentType: "image/png",
        cacheControl: "31536000", // 1 year
        upsert: false,
      });

    if (uploadError) {
      log.error("Upload failed", { error: uploadError, enrollmentId });
      return { success: false, error: uploadError.message };
    }

    // 4. Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("certificates").getPublicUrl(fileName);

    // 5. Save URL to database via API
    const saveResponse = await fetch("/api/certificate/save-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollmentId,
        imageUrl: publicUrl,
      }),
    });

    if (!saveResponse.ok) {
      log.error("Failed to save certificate URL", { enrollmentId, status: saveResponse.status });
      return { success: false, error: "Failed to save certificate URL to database" };
    }

    log.info("Certificate generated and saved successfully", { enrollmentId, publicUrl });
    return { success: true, imageUrl: publicUrl };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Certificate generation and save failed", { enrollmentId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Attempts to auto-save certificate after successful claim
 * Uses server-side certificate preview API to get data and generate image
 */
export async function tryAutoSaveCertificate(
  cohortId: string,
): Promise<GenerateAndSaveCertificateResult> {
  try {
    log.info("Attempting auto-save certificate", { cohortId });

    // 1. Get certificate data from server
    const response = await fetch(`/api/user/bootcamp/${cohortId}/certificate-preview`);
    if (!response.ok) {
      return { success: false, error: "Failed to fetch certificate data" };
    }

    const result = await response.json();
    if (!result.success || !result.data || !result.enrollmentId) {
      return { success: false, error: "Invalid certificate data received" };
    }

    // 2. Check if already has stored image
    if (result.storedImageUrl) {
      log.info("Certificate already has stored image", { cohortId });
      return { success: true, imageUrl: result.storedImageUrl };
    }

    // 3. Create temporary DOM element for rendering certificate
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.innerHTML = `
      <div style="
        width: 1200px;
        height: 800px;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 80px;
        font-family: system-ui, -apple-system, sans-serif;
        color: white;
        text-align: center;
        position: relative;
      ">
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: radial-gradient(circle at 50% 50%, rgba(255, 165, 0, 0.1) 0%, transparent 70%);
          pointer-events: none;
        "></div>
        <div style="
          font-size: 64px;
          font-weight: bold;
          background: linear-gradient(45deg, #ff6b35, #f7931e);
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          margin-bottom: 32px;
        ">CERTIFICATE</div>
        <div style="
          font-size: 24px;
          margin-bottom: 48px;
          opacity: 0.9;
        ">OF COMPLETION</div>
        <div style="
          font-size: 36px;
          font-weight: 600;
          margin-bottom: 32px;
        ">${result.data.userName}</div>
        <div style="
          font-size: 20px;
          margin-bottom: 48px;
          opacity: 0.8;
          max-width: 600px;
          line-height: 1.6;
        ">has successfully completed the ${result.data.bootcampName} bootcamp and demonstrated mastery of the required skills and competencies.</div>
        <div style="
          display: flex;
          justify-content: space-between;
          width: 100%;
          max-width: 800px;
          margin-top: 64px;
          font-size: 16px;
          opacity: 0.7;
        ">
          <div>Date: ${new Date(result.data.completionDate).toLocaleDateString()}</div>
          <div style="
            font-size: 24px;
            font-weight: bold;
            background: linear-gradient(45deg, #ff6b35, #f7931e);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
          ">P2E INFERNO ™️</div>
        </div>
      </div>
    `;

    document.body.appendChild(tempContainer);

    try {
      // 4. Generate and save certificate
      const certificateElement = tempContainer.firstElementChild as HTMLElement;
      const saveResult = await generateAndSaveCertificate({
        enrollmentId: result.enrollmentId,
        certificateData: result.data,
        element: certificateElement,
      });

      return saveResult;
    } finally {
      // 5. Clean up temporary element
      document.body.removeChild(tempContainer);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log.error("Auto-save certificate failed", { cohortId, error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

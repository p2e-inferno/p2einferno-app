import { toPng } from "html-to-image";
import type { CertificateData } from "@/components/bootcamp/CertificateTemplate";

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

import { getLogger } from "@/lib/utils/logger";
import { createAdminClient } from "@/lib/supabase/server";

const log = getLogger("bootcamp-completion:certificate:image-service");

/**
 * Validates that a URL is from Supabase Storage certificates bucket
 * @param url - The URL to validate
 * @returns true if URL is valid and from Supabase Storage
 */
export function isValidCertificateUrl(url: string): boolean {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      log.error("NEXT_PUBLIC_SUPABASE_URL not configured");
      return false;
    }

    // Must be HTTPS and from our Supabase Storage certificates bucket
    const expectedPrefix = `${supabaseUrl}/storage/v1/object/public/certificates/`;
    return url.startsWith(expectedPrefix);
  } catch (error) {
    log.error("Error validating certificate URL", { error });
    return false;
  }
}

/**
 * Service for managing certificate image URLs
 */
export class CertificateImageService {
  /**
   * Store certificate image URL in database
   * @param enrollmentId - The bootcamp enrollment ID
   * @param imageUrl - The Supabase Storage URL for the certificate image
   * @returns true if successful, false otherwise
   */
  static async storeCertificateImage(
    enrollmentId: string,
    imageUrl: string,
  ): Promise<boolean> {
    if (!isValidCertificateUrl(imageUrl)) {
      log.error("Invalid certificate URL", { enrollmentId, imageUrl });
      return false;
    }

    try {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from("bootcamp_enrollments")
        .update({ certificate_image_url: imageUrl })
        .eq("id", enrollmentId);

      if (error) {
        log.error("Database error storing certificate image", {
          enrollmentId,
          error,
        });
        throw error;
      }

      log.info("Certificate image stored", { enrollmentId });
      return true;
    } catch (error) {
      log.error("Failed to store certificate image", { enrollmentId, error });
      return false;
    }
  }

  /**
   * Get stored certificate image URL
   * @param enrollmentId - The bootcamp enrollment ID
   * @returns The certificate image URL if found and valid, null otherwise
   */
  static async getCertificateImage(
    enrollmentId: string,
  ): Promise<string | null> {
    try {
      const supabase = createAdminClient();
      const { data, error } = await supabase
        .from("bootcamp_enrollments")
        .select("certificate_image_url")
        .eq("id", enrollmentId)
        .single();

      if (error) {
        log.error("Database error retrieving certificate image", {
          enrollmentId,
          error,
        });
        return null;
      }

      if (!data?.certificate_image_url) {
        log.debug("No certificate image URL found", { enrollmentId });
        return null;
      }

      // Validate URL is from Supabase Storage
      if (!isValidCertificateUrl(data.certificate_image_url)) {
        log.warn("Invalid certificate URL in database", {
          enrollmentId,
          url: data.certificate_image_url,
        });
        return null;
      }

      return data.certificate_image_url;
    } catch (error) {
      log.error("Failed to get certificate image", { enrollmentId, error });
      return null;
    }
  }

  /**
   * Check if a certificate image exists for an enrollment
   * @param enrollmentId - The bootcamp enrollment ID
   * @returns true if a valid certificate image URL exists
   */
  static async hasCertificateImage(enrollmentId: string): Promise<boolean> {
    const imageUrl = await this.getCertificateImage(enrollmentId);
    return imageUrl !== null;
  }
}

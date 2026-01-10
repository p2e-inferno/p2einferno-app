import { getLogger } from "@/lib/utils/logger";

const log = getLogger("gooddollar:generate-fv-link");

/**
 * Parameters for generating a face verification link.
 *
 * NOTE: We use 'any' for the sdk type since we only call methods on it
 * and the actual IdentitySDK type comes from @goodsdks/citizen-sdk.
 */
export interface GenerateFVLinkParams {
  sdk: any; // IdentitySDK from @goodsdks/citizen-sdk
  callbackUrl: string;
  popupMode?: boolean;
}

/**
 * Generate a face verification link
 * @param sdk - IdentitySDK instance
 * @param callbackUrl - URL to redirect after verification (must be whitelisted in GoodDollar portal)
 * @param popupMode - If true, opens in popup; if false, full-page redirect (default: false)
 * @returns Face verification link
 */
export async function generateFVLink({
  sdk,
  callbackUrl,
  popupMode = false,
}: GenerateFVLinkParams): Promise<string> {
  try {
    const fvLink = await sdk.generateFVLink(popupMode, callbackUrl);

    log.info("Face verification link generated", {
      popupMode,
      callbackUrl,
    });

    return fvLink;
  } catch (error) {
    log.error("Failed to generate FV link", {
      callbackUrl,
      error,
    });
    throw error;
  }
}

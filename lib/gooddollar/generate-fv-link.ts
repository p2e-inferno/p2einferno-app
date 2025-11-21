import { getLogger } from '@/lib/utils/logger';

const log = getLogger('gooddollar:generate-fv-link');

/**
 * Parameters for generating a face verification link.
 *
 * NOTE: We don't import IdentitySDK from @goodsdks/citizen-sdk here because
 * this file is used in client-side components and citizen-sdk has ESM/CommonJS
 * compatibility issues with lz-string. Using 'any' for the sdk type since
 * we only call methods on it and the @goodsdks/react-hooks handles initialization.
 */
export interface GenerateFVLinkParams {
  sdk: any; // IdentitySDK from @goodsdks/citizen-sdk
  callbackUrl: string;
  popupMode?: boolean;
}

/**
 * Generate a face verification link
 *
 * Note: The SDK does NOT accept a firstName parameter.
 * The user's name/identity is derived from the message they sign during verification.
 *
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

    log.info('Face verification link generated', {
      popupMode,
      callbackUrl,
    });

    return fvLink;
  } catch (error) {
    log.error('Failed to generate FV link', {
      callbackUrl,
      error,
    });
    throw error;
  }
}

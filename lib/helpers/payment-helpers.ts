import { getLogger } from '@/lib/utils/logger';

const log = getLogger('payment-helpers');

/**
 * Payment Processing Helper Functions
 * 
 * Shared utilities for payment processing across webhook and verify endpoints
 */

export interface ApplicationIdExtractionResult {
  applicationId: string | null;
  method: 'referrer_url' | 'not_found';
  success: boolean;
}

/**
 * Extracts applicationId from Paystack payment data using referrer URL
 * 
 * This function extracts the applicationId from the referrer URL in metadata.
 * Paystack strips custom metadata but preserves the referrer URL automatically.
 * 
 * @param paystackData - The payment data from Paystack (webhook or API response)
 * @returns ApplicationIdExtractionResult with applicationId and method used
 */
export function extractApplicationId(paystackData: any): ApplicationIdExtractionResult {
  log.info("Extracting applicationId from referrer URL...");
  
  // Extract applicationId from referrer URL (only reliable method)
  if (paystackData?.metadata?.referrer) {
    log.info("Checking referrer URL:", paystackData.metadata.referrer);
    
    // Match UUID pattern in payment URL: /payment/[uuid]
    const referrerMatch = paystackData.metadata.referrer.match(/\/payment\/([a-fA-F0-9-]+)/);
    if (referrerMatch && referrerMatch[1]) {
      const applicationId = referrerMatch[1];
      log.info("✓ Found applicationId from referrer URL:", applicationId);
      
      return {
        applicationId,
        method: 'referrer_url',
        success: true
      };
    } else {
      log.info("✗ No valid UUID found in referrer URL");
    }
  } else {
    log.info("✗ No referrer URL found in metadata");
  }
  
  log.error("Failed to extract applicationId from referrer URL");
  
  return {
    applicationId: null,
    method: 'not_found',
    success: false
  };
}

/**
 * Validates that an applicationId is in valid UUID format
 * 
 * @param applicationId - The applicationId to validate
 * @returns boolean indicating if the UUID is valid
 */
export function isValidApplicationId(applicationId: string | null): boolean {
  if (!applicationId) return false;
  
  // UUID v4 pattern: 8-4-4-4-12 hex characters
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(applicationId);
}

/**
 * Enhanced applicationId extraction with validation
 * 
 * @param paystackData - The payment data from Paystack
 * @returns ApplicationIdExtractionResult with validation included
 */
export function extractAndValidateApplicationId(paystackData: any): ApplicationIdExtractionResult {
  const result = extractApplicationId(paystackData);
  
  if (result.success && result.applicationId) {
    const isValid = isValidApplicationId(result.applicationId);
    if (!isValid) {
      log.error("Extracted applicationId has invalid UUID format:", result.applicationId);
      return {
        applicationId: null,
        method: 'not_found',
        success: false
      };
    }
  }
  
  return result;
}
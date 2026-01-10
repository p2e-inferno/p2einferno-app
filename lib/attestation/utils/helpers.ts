/**
 * Helper utilities for attestations
 */

/**
 * Generate a temporary unique ID for attestations
 */
export const generateTempAttestationId = (): string => {
  return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Format attestation error messages for user display
 */
export const formatAttestationError = (error: any): string => {
  if (error instanceof Error) {
    if (
      error.message.includes("User rejected") ||
      error.message.includes("user rejected")
    ) {
      return "Transaction was cancelled by user";
    }
    if (error.message.includes("insufficient funds")) {
      return "Insufficient funds to complete the transaction";
    }
    if (error.message.includes("network")) {
      return "Network error. Please check your connection and try again";
    }
    return error.message;
  }
  return "An unknown error occurred";
};

/**
 * Check if an attestation has expired
 */
export const isAttestationExpired = (expirationTime?: string): boolean => {
  if (!expirationTime) {
    return false; // No expiration time means it never expires
  }

  const expiration = new Date(expirationTime);
  const now = new Date();
  return now > expiration;
};

/**
 * Calculate time until attestation expires
 */
export const getTimeUntilExpiration = (
  expirationTime?: string,
): string | null => {
  if (!expirationTime) {
    return null;
  }

  const expiration = new Date(expirationTime);
  const now = new Date();
  const diff = expiration.getTime() - now.getTime();

  if (diff <= 0) {
    return "Expired";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} remaining`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} remaining`;
  }
  return `${minutes} minute${minutes > 1 ? "s" : ""} remaining`;
};

/**
 * Format attestation data for display
 */
export const formatAttestationDataForDisplay = (
  data: Record<string, any>,
): Record<string, string> => {
  const formatted: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      formatted[key] = "N/A";
    } else if (typeof value === "bigint") {
      formatted[key] = value.toString();
    } else if (typeof value === "boolean") {
      formatted[key] = value ? "Yes" : "No";
    } else if (typeof value === "number") {
      formatted[key] = value.toString();
    } else {
      formatted[key] = String(value);
    }
  }

  return formatted;
};

/**
 * Get attestation category color for UI
 */
export const getAttestationCategoryColor = (category: string): string => {
  const colors: Record<string, string> = {
    attendance: "text-green-600 bg-green-100",
    social: "text-blue-600 bg-blue-100",
    verification: "text-purple-600 bg-purple-100",
    review: "text-orange-600 bg-orange-100",
    achievement: "text-yellow-600 bg-yellow-100",
    payment: "text-emerald-600 bg-emerald-100",
    reward: "text-pink-600 bg-pink-100",
  };

  return colors[category] || "text-gray-600 bg-gray-100";
};

/**
 * Truncate long attestation UIDs for display
 */
export const truncateAttestationUid = (
  uid: string,
  startChars = 6,
  endChars = 4,
): string => {
  if (uid.length <= startChars + endChars) {
    return uid;
  }
  return `${uid.substring(0, startChars)}...${uid.substring(uid.length - endChars)}`;
};

/**
 * Parse schema definition into field information
 */
export const parseSchemaDefinition = (
  definition: string,
): Array<{ type: string; name: string }> => {
  if (!definition.trim()) {
    return [];
  }

  return definition
    .split(",")
    .map((field) => field.trim())
    .filter((field) => field.length > 0)
    .map((field) => {
      const parts = field.split(/\s+/); // Split on any whitespace
      const [type, name] = parts;
      return { type: type || "", name: name || "" };
    });
};

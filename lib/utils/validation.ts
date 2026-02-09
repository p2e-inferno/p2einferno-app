/**
 * Shared validation utilities
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4 format
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Escapes special characters for SQL ILIKE patterns
 * Prevents SQL injection via wildcard characters
 */
export function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, "\\$&");
}

/**
 * File upload validation constants and utilities
 */

/** Maximum file size: 2MB in bytes */
export const MAX_FILE_SIZE = 2 * 1024 * 1024;

/** Allowed MIME types for file uploads (matches Supabase bucket policy) */
export const ALLOWED_FILE_TYPES = [
  // Images (also allow any image/* via startsWith check)
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  // Documents
  "application/pdf",
];

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates a file's type and size against allowed constraints
 * @param file - The file to validate
 * @param maxSize - Maximum file size in bytes (default: 2MB)
 * @returns Validation result with isValid flag and optional error message
 */
export function validateFile(
  file: File,
  maxSize: number = MAX_FILE_SIZE,
): FileValidationResult {
  // Validate file type
  const isValidType =
    file.type.startsWith("image/") || ALLOWED_FILE_TYPES.includes(file.type);

  if (!isValidType) {
    return {
      isValid: false,
      error: "Invalid file type. Please upload an image or PDF.",
    };
  }

  // Validate file size
  if (file.size > maxSize) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(0);
    return {
      isValid: false,
      error: `File size exceeds ${maxSizeMB}MB limit. Your file is ${fileSizeMB}MB.`,
    };
  }

  return { isValid: true };
}

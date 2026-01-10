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

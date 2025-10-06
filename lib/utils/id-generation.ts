/**
 * Generates or retrieves an ID for database records.
 *
 * This utility ensures consistent ID handling across forms:
 * - For new records: generates a new UUID
 * - For editing: preserves the existing ID
 *
 * @param isEditing - Whether the form is in edit mode
 * @param existingId - The existing ID (when editing)
 * @returns The appropriate ID to use
 */
export function getRecordId(isEditing: boolean, existingId?: string): string {
  if (isEditing && existingId) {
    return existingId;
  }

  // Generate UUID for new records
  return crypto.randomUUID();
}

/**
 * Ensures a record has a valid ID before API submission.
 *
 * @param record - The record object that needs an ID
 * @param isEditing - Whether the form is in edit mode
 * @param existingId - The existing ID (when editing)
 * @returns The record with a guaranteed ID
 */
export function ensureRecordId<T extends { id?: string }>(
  record: T,
  isEditing: boolean,
  existingId?: string,
): T & { id: string } {
  return {
    ...record,
    id: record.id || getRecordId(isEditing, existingId),
  };
}

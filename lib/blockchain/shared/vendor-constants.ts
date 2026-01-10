/**
 * DG Token Vendor Constants
 *
 * Shared constants for the DG Token Vendor contract.
 * Used across hooks, verification, and admin UI.
 */

/**
 * User Stage Labels
 * Maps stage enum values (0, 1, 2) to human-readable names
 */
export const USER_STAGE_LABELS: Record<number, string> = {
  0: "Pleb",
  1: "Hustler",
  2: "OG",
};

/**
 * Get all available stages as dropdown options
 * Returns array of {value: number, label: string} for select inputs
 */
export function getStageOptions(): Array<{ value: number; label: string }> {
  return Object.entries(USER_STAGE_LABELS).map(([value, label]) => ({
    value: Number(value),
    label,
  }));
}

/**
 * Get stage label by stage number
 * @param stage - Stage number (0, 1, 2)
 * @returns Human-readable stage name or "Unknown"
 */
export function getStageLabel(stage: number): string {
  return USER_STAGE_LABELS[stage] ?? "Unknown";
}

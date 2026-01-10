export const normalizeAddress = (
  address?: string | null
): string | null => {
  if (!address) return null;
  return address.trim().toLowerCase();
};

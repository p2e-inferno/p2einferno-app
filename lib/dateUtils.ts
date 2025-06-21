// lib/dateUtils.ts
export const formatDate = (dateString?: string | null, options?: Intl.DateTimeFormatOptions): string => {
  if (!dateString) return "Not set";
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  try {
    return new Date(dateString).toLocaleDateString(undefined, options || defaultOptions);
  } catch (e) {
    console.error("Error formatting date:", e);
    return "Invalid date";
  }
};

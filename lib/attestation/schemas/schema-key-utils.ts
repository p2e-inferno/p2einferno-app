export const normalizeSchemaKey = (input: string): string => {
  const trimmed = (input || "").trim().toLowerCase();
  const spaced = trimmed.replace(/\s+/g, "_").replace(/-+/g, "_");
  const cleaned = spaced.replace(/[^a-z0-9_]/g, "");
  return cleaned.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
};

export const isValidSchemaKey = (input: string): boolean =>
  /^[a-z0-9_]+$/.test(input);

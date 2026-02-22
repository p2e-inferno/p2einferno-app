export const isValidTransactionHash = (value: string): boolean =>
  /^0x[a-fA-F0-9]{64}$/.test(value.trim());

export const normalizeTransactionHash = (value: string): string =>
  value.trim().toLowerCase();

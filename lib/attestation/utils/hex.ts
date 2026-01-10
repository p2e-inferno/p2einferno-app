export const isBytes32Hex = (value: string): value is `0x${string}` =>
  /^0x[0-9a-fA-F]{64}$/.test(value);


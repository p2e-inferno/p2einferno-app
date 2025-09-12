export function sanitizeString(input: string): string {
  if (!input) return input;
  let out = input;
  out = out.replace(/(priv(?:ate)?_?key|secret|password|token)=[^&\s]+/gi, '$1=[REDACTED]');
  out = out.replace(/0x[a-fA-F0-9]{64,}/g, (m) => `${m.slice(0, 6)}...[REDACTED]`);
  return out;
}

export function sanitizeValue(val: any): any {
  if (typeof val === 'string') return sanitizeString(val);
  if (typeof val === 'object' && val !== null) {
    const clone: any = Array.isArray(val) ? [] : {};
    for (const [k, v] of Object.entries(val)) {
      if (/password|secret|private|token/i.test(k)) {
        clone[k] = '[REDACTED]';
      } else if (/address/i.test(k) && typeof v === 'string' && v.startsWith('0x') && v.length >= 10) {
        clone[k] = `${v.slice(0, 6)}...${v.slice(-4)}`;
      } else {
        clone[k] = sanitizeValue(v);
      }
    }
    return clone;
  }
  return val;
}

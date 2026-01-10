/* deno-lint-ignore-file no-explicit-any */
declare const Deno: { env: { get(key: string): string | undefined } };

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("NEXT_SUPABASE_SERVICE_ROLE_KEY")!;

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

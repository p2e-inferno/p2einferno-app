import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in browser/client-side components
 *
 * This client should be used in:
 * - Client components
 * - Browser-side interactions
 * - Real-time subscriptions
 *
 * Uses the anonymous key for security.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in your environment variables."
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Create a singleton instance for client-side use
export const supabase = createClient();

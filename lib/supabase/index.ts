// Export client-side configuration
export { createClient as createBrowserClient, supabase } from "./client";

// Export server-side configuration
export {
  createClient as createServerClient,
  createAdminClient,
} from "./server";

// Export types
export type * from "./types";

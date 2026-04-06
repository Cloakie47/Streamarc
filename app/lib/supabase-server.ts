import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side only — never expose service role key to client.
// Client is created lazily so that missing env vars are caught at runtime
// (when the server actually handles a request) rather than at build time
// during static page generation.
export function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL"
    );
  }
  if (!supabaseServiceKey) {
    throw new Error(
      "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

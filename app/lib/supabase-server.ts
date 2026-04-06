import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side only — never expose service role key to client
const supabaseAdminClient = createClient(supabaseUrl, supabaseServiceKey);

export function getSupabaseAdmin() {
  return supabaseAdminClient;
}

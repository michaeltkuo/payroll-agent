import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabaseClient: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

/** Browser/client-side Supabase client using the anon key (lazy-initialized) */
export function getSupabaseClient(): SupabaseClient {
  if (!_supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    _supabaseClient = createClient(url, key);
  }
  return _supabaseClient;
}

/** Server-side Supabase client using the service role key — bypasses RLS (lazy-initialized) */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    _supabaseAdmin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}

// Convenience re-exports for backward compatibility
export const supabaseClient = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => getSupabaseClient()[prop as keyof SupabaseClient],
});
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get: (_target, prop) => getSupabaseAdmin()[prop as keyof SupabaseClient],
});

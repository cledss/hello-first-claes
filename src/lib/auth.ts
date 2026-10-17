import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getAuthClient() {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  // Browser-only session state; no shared SSR client or session.
  if (typeof window === "undefined") return null;
  client ??= createClient(url, key, {
    auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true },
  });
  return client;
}

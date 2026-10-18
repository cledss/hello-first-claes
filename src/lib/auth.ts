import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
const LOGIN_AT_KEY = "secondself:verified-login-at";
export const LOGIN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function getAuthClient() {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key || typeof window === "undefined") return null;
  client ??= createClient(url, key, {
    auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
  });
  return client;
}

/**
 * A verified magic-link login is remembered for at most seven days in this browser.
 * Refresh tokens may rotate inside that window, but cannot extend it indefinitely.
 * The backend continues to validate every access token and active session.
 */
export async function enforceSevenDayLogin(authClient: SupabaseClient) {
  const { data, error } = await authClient.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session || session.user.is_anonymous) return session;
  let started = Number(window.localStorage.getItem(LOGIN_AT_KEY));
  if (!Number.isFinite(started) || started <= 0) {
    started = Date.now();
    window.localStorage.setItem(LOGIN_AT_KEY, String(started));
  }
  if (Date.now() - started >= LOGIN_MAX_AGE_MS) {
    await authClient.auth.signOut();
    window.localStorage.removeItem(LOGIN_AT_KEY);
    return null;
  }
  return session;
}

export function markVerifiedLogin() {
  const existing = Number(window.localStorage.getItem(LOGIN_AT_KEY));
  if (!Number.isFinite(existing) || existing <= 0) {
    window.localStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
  }
}

export function clearVerifiedLogin() {
  window.localStorage.removeItem(LOGIN_AT_KEY);
}

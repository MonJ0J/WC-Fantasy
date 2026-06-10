import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  // We don't throw — the Landing page surfaces a friendly setup message.
  // eslint-disable-next-line no-console
  console.warn(
    "[wc-fantasy] Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "anon-placeholder", {
  auth: { persistSession: false },
});

export const isConfigured = Boolean(url && anonKey);

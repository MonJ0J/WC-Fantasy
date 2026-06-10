// Local test runner: spins up the Edge Function on http://localhost:8787 so we
// can curl it. Used only during development. The function code itself is
// imported unchanged from supabase/functions/sync-wc-matches/index.ts.

// Load env from /tmp/wcf-sync.env (so secrets never live in the repo).
const envPath = "/tmp/wcf-sync.env";
try {
  const text = await Deno.readTextFile(envPath);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
    Deno.env.set(key, val);
  }
  console.log(`loaded env from ${envPath}`);
} catch (e) {
  console.warn(`could not read ${envPath}: ${(e as Error).message}`);
}

await import("./supabase/functions/sync-wc-matches/index.ts");

import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getMyDashboard, signIn, signUp, type DashboardGroup } from "../lib/api";
import { isConfigured } from "../lib/supabase";
import { useUserStore } from "../stores/userStore";
import { Spinner } from "../components/Primitives";
import { cx } from "../lib/utils";

type AuthMode = "signin" | "signup";

export function Landing() {
  const { playerId, displayName, setIdentity } = useUserStore();
  const navigate = useNavigate();
  const location = useLocation();
  const pendingCode = (location.state as { joinCode?: string } | null)?.joinCode ?? null;

  useEffect(() => {
    // If a signed-in user lands here via /join?code=..., bounce them to the group
    // (GroupLayout idempotently joins them on mount).
    if (playerId && pendingCode) {
      navigate(`/g/${pendingCode}`, { replace: true });
    }
  }, [playerId, pendingCode, navigate]);

  if (playerId) {
    return <SignedInHome playerId={playerId} displayName={displayName ?? ""} />;
  }

  return (
    <AuthView
      pendingCode={pendingCode}
      onSuccess={(id, name, username) => {
        setIdentity({ playerId: id, displayName: name, username });
        navigate(pendingCode ? `/g/${pendingCode}` : "/me");
      }}
    />
  );
}

function AuthView({
  pendingCode,
  onSuccess,
}: {
  pendingCode: string | null;
  onSuccess: (playerId: string, displayName: string, username: string) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(pendingCode ? "signup" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const u = username.trim();
      if (!u) throw new Error("Username is required");
      if (!password) throw new Error("Password is required");

      if (mode === "signup") {
        if (!/^[A-Za-z0-9_]{3,20}$/.test(u))
          throw new Error("Username must be 3-20 letters, numbers or underscores");
        if (password.length < 6) throw new Error("Password must be at least 6 characters");
        const finalDisplay = (displayName.trim() || u).slice(0, 30);
        const id = await signUp({ username: u, password, displayName: finalDisplay });
        onSuccess(id.player_id, id.display_name, u);
      } else {
        const id = await signIn({ username: u, password });
        onSuccess(id.player_id, id.display_name, u);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-4 pb-24 pt-10">
      <header className="space-y-2 text-center">
        <div className="text-5xl">🏆</div>
        <h1 className="text-3xl font-bold tracking-tight">WC-Fantasy</h1>
        <p className="text-sm text-slate-600">
          Predict every 2026 World Cup match with your friends.
        </p>
        {pendingCode && (
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
            You're joining group <strong>{pendingCode}</strong>. Sign in or create an account first.
          </p>
        )}
      </header>

      {!isConfigured && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          <strong>Setup needed:</strong> add <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("signin")}
            className={cx(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              mode === "signin" ? "bg-white text-slate-900 shadow" : "text-slate-600",
            )}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("signup")}
            className={cx(
              "flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
              mode === "signup" ? "bg-white text-slate-900 shadow" : "text-slate-600",
            )}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Username">
            <input
              className="input lowercase tracking-wide"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="e.g. juan_92"
              value={username}
              maxLength={20}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>

          <Field label="Password">
            <input
              className="input"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              placeholder={mode === "signup" ? "at least 6 characters" : ""}
              value={password}
              maxLength={128}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {mode === "signup" && (
            <Field
              label="Display name"
              hint="What appears on leaderboards. Defaults to your username."
            >
              <input
                className="input"
                placeholder="e.g. Juan"
                value={displayName}
                maxLength={30}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </Field>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Spinner /> : mode === "signup" ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500">
          {mode === "signup" ? "Already have an account? " : "First time here? "}
          <button
            type="button"
            className="font-semibold text-brand-700 hover:underline"
            onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))}
          >
            {mode === "signup" ? "Sign in" : "Create one"}
          </button>
        </p>
      </div>

      <p className="text-center text-xs text-slate-500">
        No email needed. Your username + password let you sign in from any device.{" "}
        <Link to="/how" className="font-semibold text-brand-700 hover:underline">
          How to play
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

// ---------------------------------------------------------------------------

function SignedInHome({ playerId, displayName }: { playerId: string; displayName: string }) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<DashboardGroup[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await getMyDashboard(playerId);
        if (!cancelled) setGroups(list);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-24 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500">Welcome back</p>
          <h1 className="text-2xl font-bold">{displayName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/how" className="btn-ghost !py-2 text-xs">
            How to play
          </Link>
          <Link to="/me" className="btn-ghost !py-2 text-xs">
            Settings
          </Link>
        </div>
      </header>

      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => navigate("/me?action=create")} className="btn-primary text-sm">
          + Create a group
        </button>
        <button onClick={() => navigate("/me?action=join")} className="btn-secondary text-sm">
          Join a group
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-bold uppercase tracking-wider text-slate-500">
          Your groups
        </h2>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner className="h-6 w-6 text-brand-600" />
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="card text-center text-sm text-slate-600">
            <p>You're not in any groups yet.</p>
            <p className="mt-1 text-xs">Use the buttons above to create one or join with a code.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {groups.map((g) => (
              <Link
                key={g.group_id}
                to={`/g/${g.invite_code}`}
                className="card flex items-center justify-between gap-3 transition hover:border-brand-300 hover:shadow-md"
              >
                <div>
                  <h3 className="text-base font-semibold">{g.group_name}</h3>
                  <p className="text-xs text-slate-500">
                    {g.member_count} member{g.member_count === 1 ? "" : "s"} ·{" "}
                    <span className="font-mono">{g.invite_code}</span>
                    {g.is_creator && (
                      <span className="ml-1 text-emerald-700">· creator</span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">{g.total_points}</div>
                  <div className="text-[11px] text-slate-500">
                    {g.my_rank > 0 ? `rank #${g.my_rank}` : "unranked"}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

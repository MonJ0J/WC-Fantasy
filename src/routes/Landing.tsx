import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createGroup, createPlayer, joinGroup, getGroupByCode } from "../lib/api";
import { isConfigured } from "../lib/supabase";
import { useUserStore } from "../stores/userStore";
import { Spinner } from "../components/Primitives";

export function Landing() {
  const navigate = useNavigate();
  const { playerId, displayName, setIdentity } = useUserStore();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [name, setName] = useState(displayName ?? "");
  const [groupName, setGroupName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensurePlayer(): Promise<string> {
    if (playerId && displayName === name.trim()) return playerId;
    const id = await createPlayer(name.trim());
    setIdentity(id, name.trim());
    return id;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!name.trim()) throw new Error("Please enter your display name");
      const pid = await ensurePlayer();

      if (mode === "create") {
        if (!groupName.trim()) throw new Error("Please name your group");
        const { invite_code } = await createGroup(pid, groupName.trim());
        navigate(`/g/${invite_code}`);
      } else {
        if (!code.trim()) throw new Error("Please enter an invite code");
        const grp = await getGroupByCode(code);
        if (!grp) throw new Error("Invite code not found");
        await joinGroup(pid, code);
        navigate(`/g/${grp.invite_code}`);
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
          Predict every 2026 World Cup match with your friends — no accounts, just a name.
        </p>
      </header>

      {!isConfigured && (
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          <strong>Setup needed:</strong> add <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> to your environment, then reload.
        </div>
      )}

      <div className="card space-y-4">
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === "create" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
          >
            Create a group
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${mode === "join" ? "bg-white text-slate-900 shadow" : "text-slate-600"}`}
          >
            Join a group
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
              Your display name
            </span>
            <input
              className="input"
              placeholder="e.g. Juan"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          {mode === "create" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Group name
              </span>
              <input
                className="input"
                placeholder="e.g. Neighbors pool"
                value={groupName}
                maxLength={60}
                onChange={(e) => setGroupName(e.target.value)}
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                Invite code
              </span>
              <input
                className="input uppercase tracking-widest"
                placeholder="WC-XXXXXX"
                value={code}
                maxLength={12}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <Spinner /> : mode === "create" ? "Create group" : "Join group"}
          </button>
        </form>
      </div>

      {playerId && (
        <p className="text-center text-xs text-slate-500">
          Logged in as <strong>{displayName}</strong> ·{" "}
          <Link to="/me" className="underline">
            switch identity
          </Link>
        </p>
      )}
    </div>
  );
}

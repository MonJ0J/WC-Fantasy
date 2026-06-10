import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getMyGroups, renamePlayer } from "../lib/api";
import type { GroupSession } from "../lib/types";
import { useUserStore } from "../stores/userStore";
import { Spinner } from "../components/Primitives";

export function Me() {
  const navigate = useNavigate();
  const { playerId, displayName, updateName, clear } = useUserStore();
  const [groups, setGroups] = useState<GroupSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState(displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const g = await getMyGroups(playerId);
      if (!cancelled) {
        setGroups(g);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId, navigate]);

  async function handleRename(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId || !name.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      await renamePlayer(playerId, name.trim());
      updateName(name.trim());
      setMsg("Saved");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSaving(false);
    }
  }

  function signOut() {
    if (confirm("Forget this identity on this device? You can re-join groups later by code.")) {
      clear();
      navigate("/", { replace: true });
    }
  }

  if (!playerId) return null;

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pt-8">
      <header className="text-center">
        <h1 className="text-2xl font-bold">Your profile</h1>
        <p className="text-xs text-slate-500">Identity is just stored on this device.</p>
      </header>

      <form onSubmit={handleRename} className="card space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Display name
          </span>
          <input
            className="input"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? <Spinner /> : "Save name"}
        </button>
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      </form>

      <div className="card p-0">
        <h2 className="px-4 py-3 text-sm font-semibold text-slate-700">Your groups</h2>
        {loading ? (
          <div className="flex h-20 items-center justify-center">
            <Spinner className="h-5 w-5 text-brand-600" />
          </div>
        ) : groups.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            You're not in any groups yet.{" "}
            <Link to="/" className="text-brand-600 underline">
              Create or join one
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link to={`/g/${g.invite_code}`} className="font-medium text-brand-700 underline">
                  {g.name}
                </Link>
                <span className="font-mono text-xs text-slate-500">{g.invite_code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700">Switch identity</h2>
        <p className="mt-1 text-xs text-slate-600">
          Useful on a shared device. This only removes your identity locally; your predictions
          remain stored on the server.
        </p>
        <button type="button" className="btn-secondary mt-3 w-full" onClick={signOut}>
          Forget me on this device
        </button>
      </div>
    </div>
  );
}

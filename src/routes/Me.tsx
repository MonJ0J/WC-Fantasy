import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  createGroup,
  getGroupByCode,
  joinGroup,
  renamePlayer,
} from "../lib/api";
import { useUserStore } from "../stores/userStore";
import { Spinner } from "../components/Primitives";
import { cx } from "../lib/utils";

export function Me() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { playerId, displayName, username, updateName, clear } = useUserStore();

  const [tab, setTab] = useState<"create" | "join" | "settings">(
    params.get("action") === "join"
      ? "join"
      : params.get("action") === "create"
        ? "create"
        : "settings",
  );

  useEffect(() => {
    if (!playerId) navigate("/", { replace: true });
  }, [playerId, navigate]);

  if (!playerId) return null;

  function switchTab(t: "create" | "join" | "settings") {
    setTab(t);
    if (t === "settings") setParams({}, { replace: true });
    else setParams({ action: t }, { replace: true });
  }

  return (
    <div className="mx-auto max-w-md space-y-4 p-4 pt-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Your profile</h1>
          <p className="text-xs text-slate-500">
            {username ? (
              <>
                Signed in as <span className="font-mono">@{username}</span>
              </>
            ) : (
              <>Display name: {displayName}</>
            )}
          </p>
        </div>
        <Link to="/" className="btn-ghost !py-2 text-xs">
          Home
        </Link>
      </header>

      <div className="flex rounded-xl bg-slate-100 p-1">
        {(
          [
            ["create", "Create group"],
            ["join", "Join group"],
            ["settings", "Settings"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => switchTab(key)}
            className={cx(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition",
              tab === key ? "bg-white text-slate-900 shadow" : "text-slate-600",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "create" && <CreateGroup playerId={playerId} />}
      {tab === "join" && <JoinGroup playerId={playerId} />}
      {tab === "settings" && (
        <Settings
          displayName={displayName ?? ""}
          onRename={async (name) => {
            await renamePlayer(playerId, name);
            updateName(name);
          }}
          onSignOut={() => {
            clear();
            navigate("/", { replace: true });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreateGroup({ playerId }: { playerId: string }) {
  const navigate = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!groupName.trim()) throw new Error("Please name your group");
      const { invite_code } = await createGroup(playerId, groupName.trim());
      navigate(`/g/${invite_code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Spinner /> : "Create group"}
      </button>
    </form>
  );
}

function JoinGroup({ playerId }: { playerId: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!code.trim()) throw new Error("Please enter an invite code");
      const grp = await getGroupByCode(code);
      if (!grp) throw new Error("Invite code not found");
      await joinGroup(playerId, code);
      navigate(`/g/${grp.invite_code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join group");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-3">
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
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={loading}>
        {loading ? <Spinner /> : "Join group"}
      </button>
    </form>
  );
}

function Settings({
  displayName,
  onRename,
  onSignOut,
}: {
  displayName: string;
  onRename: (name: string) => Promise<void>;
  onSignOut: () => void;
}) {
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setMsg(null);
    try {
      await onRename(name.trim());
      setMsg("Saved");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card space-y-3">
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
          <span className="mt-1 block text-[11px] text-slate-500">
            What others see on leaderboards. Your login username never changes.
          </span>
        </label>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? <Spinner /> : "Save name"}
        </button>
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
      </form>

      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700">Sign out</h2>
        <p className="mt-1 text-xs text-slate-600">
          Forgets your identity on this device. You can sign back in any time with your username
          and password.
        </p>
        <button
          type="button"
          className="btn-secondary mt-3 w-full"
          onClick={() => {
            if (confirm("Sign out of this device?")) onSignOut();
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

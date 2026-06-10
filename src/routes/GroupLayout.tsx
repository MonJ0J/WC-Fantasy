import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useParams } from "react-router-dom";
import { getGroupByCode, joinGroup } from "../lib/api";
import type { GroupSession } from "../lib/types";
import { useUserStore } from "../stores/userStore";
import { Spinner } from "../components/Primitives";
import { copyToClipboard, cx } from "../lib/utils";

export interface GroupContext {
  group: GroupSession;
  playerId: string;
}

export function GroupLayout() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { playerId, displayName } = useUserStore();
  const [group, setGroup] = useState<GroupSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!playerId) {
      navigate("/", { replace: true });
      return;
    }
    if (!code) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const g = await getGroupByCode(code);
        if (!g) throw new Error("Group not found");
        // Idempotent join in case the user is following a fresh invite link.
        await joinGroup(playerId, code);
        if (!cancelled) setGroup(g);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load group");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, playerId, navigate]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }
  if (error || !group || !playerId) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-red-600">{error ?? "Group not available"}</p>
        <button className="btn-secondary mt-4" onClick={() => navigate("/")}>
          Go home
        </button>
      </div>
    );
  }

  const tabs = [
    { to: `/g/${group.invite_code}`, label: "Matches", end: true },
    { to: `/g/${group.invite_code}/outrights`, label: "Outrights" },
    { to: `/g/${group.invite_code}/bracket`, label: "Bracket" },
    { to: `/g/${group.invite_code}/leaderboard`, label: "Leaderboard" },
    { to: `/g/${group.invite_code}/members`, label: "Members" },
    { to: `/how`, label: "How to play" },
  ];

  async function copyInvite() {
    const url = `${window.location.origin}/join?code=${group?.invite_code}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold">{group.name}</h1>
            <p className="text-xs text-slate-500">
              Signed in as <strong>{displayName}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyInvite} className="btn-secondary !py-2 text-xs">
              {copied ? "Copied!" : `Share · ${group.invite_code}`}
            </button>
            <NavLink to="/me" className="btn-ghost !py-2 text-xs">
              Me
            </NavLink>
          </div>
        </div>
        <nav className="mx-auto flex max-w-3xl items-center gap-1 overflow-x-auto px-4 pb-2 sm:px-4">
          {tabs.slice(0, -1).map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition",
                  isActive
                    ? "bg-brand-100 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100",
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
          <NavLink
            to="/how"
            className={({ isActive }) =>
              cx(
                "ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                isActive
                  ? "bg-amber-200 text-amber-900"
                  : "bg-amber-50 text-amber-800 hover:bg-amber-100",
              )
            }
          >
            <span aria-hidden>❓</span> How to play
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet context={{ group, playerId } satisfies GroupContext} />
      </main>
    </div>
  );
}

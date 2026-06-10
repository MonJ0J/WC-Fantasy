import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  getAllMatches,
  getAllTeams,
  getLastSync,
  setMatchResult,
  setMatchTeams,
  type SyncLogRow,
} from "../lib/api";
import type { Match, MatchStatus, Team } from "../lib/types";
import { STAGE_LABEL } from "../lib/scoring";
import { formatKickoff } from "../lib/timezone";
import { Spinner } from "../components/Primitives";
import { cx } from "../lib/utils";

/**
 * /admin?key=… is the fallback manual results-entry console.
 * Anyone with the URL + the shared admin key can enter scores and (for KO
 * rounds) populate the home/away team ids.
 */
export function Admin() {
  const [params] = useSearchParams();
  const envKey = import.meta.env.VITE_ADMIN_KEY ?? "";
  const urlKey = params.get("key") ?? "";
  const adminKey = urlKey || envKey;

  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<SyncLogRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [m, t, s] = await Promise.all([
        getAllMatches(),
        getAllTeams(),
        getLastSync().catch(() => null),
      ]);
      if (cancelled) return;
      setMatches(m);
      setTeams(t);
      setLastSync(s);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  async function refreshOne(matchId: number) {
    const m = await getAllMatches();
    setMatches(m);
    void matchId;
  }

  async function handleResult(m: Match, home: number, away: number, status: MatchStatus) {
    setBusyId(m.id);
    setError(null);
    try {
      await setMatchResult({
        adminKey,
        matchId: m.id,
        homeScore: home,
        awayScore: away,
        status,
      });
      await refreshOne(m.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save result");
    } finally {
      setBusyId(null);
    }
  }

  async function handleTeams(m: Match, home: string, away: string) {
    setBusyId(m.id);
    setError(null);
    try {
      await setMatchTeams({
        adminKey,
        matchId: m.id,
        homeTeam: home,
        awayTeam: away,
      });
      await refreshOne(m.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign teams");
    } finally {
      setBusyId(null);
    }
  }

  if (!adminKey) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="card border-amber-300 bg-amber-50 text-sm text-amber-900">
          Admin key required. Append <code>?key=YOUR-KEY</code> to the URL.
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24 pt-6">
      <header>
        <h1 className="text-2xl font-bold">Admin · Results entry</h1>
        <p className="text-xs text-slate-500">
          Use this when the auto-sync is unavailable. Saving recomputes the leaderboard immediately.
        </p>
      </header>

      <SyncStatusCard lastSync={lastSync} />

      {error && <div className="card border-red-300 bg-red-50 text-sm text-red-700">{error}</div>}

      <div className="space-y-3">
        {matches.map((m) => (
          <AdminMatchCard
            key={m.id}
            match={m}
            teamById={teamById}
            allTeams={teams}
            busy={busyId === m.id}
            onResult={(h, a, s) => handleResult(m, h, a, s)}
            onTeams={(h, a) => handleTeams(m, h, a)}
          />
        ))}
      </div>
    </div>
  );
}

function AdminMatchCard({
  match,
  teamById,
  allTeams,
  busy,
  onResult,
  onTeams,
}: {
  match: Match;
  teamById: Map<string, Team>;
  allTeams: Team[];
  busy: boolean;
  onResult: (home: number, away: number, status: MatchStatus) => void;
  onTeams: (home: string, away: string) => void;
}) {
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [homeTeam, setHomeTeam] = useState(match.home_team_id ?? "");
  const [awayTeam, setAwayTeam] = useState(match.away_team_id ?? "");

  const needsTeams = match.stage !== "GROUP" && (!match.home_team_id || !match.away_team_id);

  return (
    <article className="card">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          #{match.id} · {STAGE_LABEL[match.stage]}
          {match.group_letter && ` · Group ${match.group_letter}`}
        </span>
        <span>{formatKickoff(match.kickoff_at)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span className="flex-1 truncate font-semibold">
          {teamById.get(match.home_team_id ?? "")?.flag_emoji}{" "}
          {teamById.get(match.home_team_id ?? "")?.name ?? match.home_placeholder ?? "TBD"}
        </span>
        <span className="text-slate-400">vs</span>
        <span className="flex-1 truncate text-right font-semibold">
          {teamById.get(match.away_team_id ?? "")?.flag_emoji}{" "}
          {teamById.get(match.away_team_id ?? "")?.name ?? match.away_placeholder ?? "TBD"}
        </span>
      </div>

      {needsTeams && (
        <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
          <div className="font-semibold text-amber-800">Assign teams (KO only)</div>
          <div className="grid grid-cols-2 gap-2">
            <TeamSelect value={homeTeam} onChange={setHomeTeam} teams={allTeams} />
            <TeamSelect value={awayTeam} onChange={setAwayTeam} teams={allTeams} />
          </div>
          <button
            disabled={busy || !homeTeam || !awayTeam}
            onClick={() => onTeams(homeTeam, awayTeam)}
            className="btn-secondary !py-1.5 !text-xs"
          >
            {busy ? <Spinner className="h-4 w-4" /> : "Save teams"}
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          aria-label="home score"
          className={cx("h-9 w-14 rounded-lg border border-slate-300 text-center font-bold")}
          inputMode="numeric"
          value={home}
          onChange={(e) => setHome(e.target.value.replace(/\D/g, "").slice(0, 2))}
        />
        <span className="text-slate-400">–</span>
        <input
          aria-label="away score"
          className={cx("h-9 w-14 rounded-lg border border-slate-300 text-center font-bold")}
          inputMode="numeric"
          value={away}
          onChange={(e) => setAway(e.target.value.replace(/\D/g, "").slice(0, 2))}
        />

        <button
          disabled={busy || home === "" || away === ""}
          onClick={() => onResult(Number(home), Number(away), "FINISHED")}
          className="btn-primary !py-1.5 !text-xs"
        >
          {busy ? <Spinner className="h-4 w-4" /> : "Finalize"}
        </button>
        <button
          disabled={busy || home === "" || away === ""}
          onClick={() => onResult(Number(home), Number(away), "LIVE")}
          className="btn-secondary !py-1.5 !text-xs"
        >
          Mark live
        </button>

        <span className="ml-auto text-xs text-slate-500">
          Status: <strong>{match.status}</strong>
        </span>
      </div>
    </article>
  );
}

function TeamSelect({
  value,
  onChange,
  teams,
}: {
  value: string;
  onChange: (v: string) => void;
  teams: Team[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input !py-1.5 !text-xs">
      <option value="">— team —</option>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.flag_emoji} {t.name}
        </option>
      ))}
    </select>
  );
}

function SyncStatusCard({ lastSync }: { lastSync: SyncLogRow | null }) {
  if (!lastSync) {
    return (
      <div className="card border-slate-200 bg-slate-50 text-sm text-slate-700">
        <strong>Auto-sync:</strong> never run. Deploy the{" "}
        <code className="rounded bg-slate-200 px-1 text-xs">sync-wc-matches</code> Edge Function and
        wire up pg_cron — see the README.
      </div>
    );
  }
  const ageMs = Date.now() - new Date(lastSync.started_at).getTime();
  const ageMin = Math.floor(ageMs / 60000);
  const ageLabel = ageMin < 1 ? "just now" : ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ago`;
  const tone =
    lastSync.status === "OK"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : lastSync.status === "ERROR"
        ? "border-red-200 bg-red-50 text-red-900"
        : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <div className={cx("card text-sm", tone)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <strong>Auto-sync:</strong> {lastSync.status} · {ageLabel}
        </span>
        <span className="text-xs">
          {lastSync.matches_updated} updated · {lastSync.finalized_count} finalized ·{" "}
          {lastSync.matches_seen} seen
        </span>
      </div>
      {lastSync.error_message && <p className="mt-1 text-xs">{lastSync.error_message}</p>}
    </div>
  );
}

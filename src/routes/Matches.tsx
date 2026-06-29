import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  getAllMatches,
  getAllTeams,
  getGroupMembers,
  getMyMatchPredictions,
  getPublicPredictions,
} from "../lib/api";
import { supabase } from "../lib/supabase";
import type {
  Match,
  MatchPrediction,
  Player,
  PublicMatchPrediction,
  Team,
} from "../lib/types";
import { AutoFillModal } from "../components/AutoFillModal";
import { ImportPicksModal } from "../components/ImportPicksModal";
import { MatchCard } from "../components/MatchCard";
import { EmptyState, Spinner } from "../components/Primitives";
import { dayKey, formatDay } from "../lib/timezone";
import { cx } from "../lib/utils";
import type { GroupContext } from "./GroupLayout";

type Filter = "today" | "upcoming" | "all" | "live" | "finished";
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
  { key: "live", label: "Live" },
  { key: "finished", label: "Finished" },
];

export function Matches() {
  const { group, playerId } = useOutletContext<GroupContext>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [predictions, setPredictions] = useState<MatchPrediction[]>([]);
  const [members, setMembers] = useState<Player[]>([]);
  const [publicPicks, setPublicPicks] = useState<PublicMatchPrediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("today");
  const [groupFilter, setGroupFilter] = useState<string>("ALL");
  const [stageFilter, setStageFilter] = useState<"ALL" | "GROUP" | "KO">("KO");
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [m, t, p, mem, pub] = await Promise.all([
          getAllMatches(),
          getAllTeams(),
          getMyMatchPredictions(playerId, group.id),
          getGroupMembers(group.id),
          getPublicPredictions(group.id).catch(() => [] as PublicMatchPrediction[]),
        ]);
        if (cancelled) return;
        setMatches(m);
        setTeams(t);
        setPredictions(p);
        setMembers(mem);
        setPublicPicks(pub);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id, playerId]);

  // Realtime: push score / status / team-id updates to the UI without refresh.
  useEffect(() => {
    const channel = supabase
      .channel("matches-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "matches" },
        (payload) => {
          const updated = payload.new as Match;
          setMatches((cur) => cur.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  // Group stage is done — when the user switches to Upcoming, auto-narrow
  // to knockout matches (and hide the group-letter filter below).
  useEffect(() => {
    if (filter === "upcoming" && stageFilter === "GROUP") {
      setStageFilter("KO");
    }
  }, [filter, stageFilter]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const predByMatch = useMemo(
    () => new Map(predictions.map((p) => [p.match_id, p])),
    [predictions],
  );
  const nameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.display_name])),
    [members],
  );
  const publicByMatch = useMemo(() => {
    const map = new Map<number, PublicMatchPrediction[]>();
    for (const p of publicPicks) {
      const arr = map.get(p.match_id) ?? [];
      arr.push(p);
      map.set(p.match_id, arr);
    }
    return map;
  }, [publicPicks]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const today = dayKey(new Date().toISOString());
    return matches.filter((m) => {
      if (stageFilter === "GROUP" && m.stage !== "GROUP") return false;
      if (stageFilter === "KO" && m.stage === "GROUP") return false;
      if (groupFilter !== "ALL" && m.group_letter !== groupFilter) return false;
      const kickoff = new Date(m.kickoff_at).getTime();
      switch (filter) {
        case "today":
          return dayKey(m.kickoff_at) === today;
        case "upcoming":
          return kickoff > now && m.status !== "FINISHED";
        case "live":
          return m.status === "LIVE" || (kickoff <= now && m.status !== "FINISHED");
        case "finished":
          return m.status === "FINISHED";
        case "all":
        default:
          return true;
      }
    });
  }, [matches, filter, groupFilter, stageFilter]);

  const grouped = useMemo(() => {
    const byDay = new Map<string, Match[]>();
    for (const m of filtered) {
      const k = dayKey(m.kickoff_at);
      const list = byDay.get(k) ?? [];
      list.push(m);
      byDay.set(k, list);
    }
    return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const groupLetters = useMemo(() => {
    const s = new Set<string>();
    for (const m of matches) if (m.group_letter) s.add(m.group_letter);
    return Array.from(s).sort();
  }, [matches]);

  function handleSaved(p: MatchPrediction) {
    setPredictions((cur) => {
      const next = cur.filter((x) => x.match_id !== p.match_id);
      next.push(p);
      return next;
    });
  }

  function handleAutoFilled(saved: MatchPrediction[]) {
    setPredictions((cur) => {
      const filledIds = new Set(saved.map((p) => p.match_id));
      const kept = cur.filter((x) => !filledIds.has(x.match_id));
      return [...kept, ...saved];
    });
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HowToPlayCallout />
      <NewAwardsCallout outrightsPath={`/g/${group.invite_code}/outrights`} />

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              filter === f.key
                ? "bg-brand-600 text-white dark:bg-brand-500"
                : "bg-slate-100 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700",
            )}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => setAutoFillOpen(true)}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-emerald-500/30"
          title="Pick which teams advance and we fill in the rest"
        >
          🎲 Auto-fill picks
        </button>        <button
          onClick={() => setImportOpen(true)}
          className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-semibold text-violet-800 transition hover:bg-violet-200"
          title="Copy picks from another group you're in"
        >
          📥 Import picks
        </button>      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Stage</span>
        {(["KO", "ALL"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStageFilter(s)}
            className={cx(
              "rounded-md px-2 py-1 text-xs font-medium transition",
              stageFilter === s
                ? "bg-slate-900 text-white dark:bg-slate-200 dark:text-slate-900"
                : "bg-slate-100 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700",
            )}
          >
            {s === "KO" ? "Knockout" : "All matches"}
          </button>
        ))}
        {filter !== "upcoming" && (
          <>
            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">Group</span>
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white px-2 py-1 text-xs dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="ALL">All</option>
              {groupLetters.map((g) => (
                <option key={g} value={g}>
                  Group {g}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          title="No matches in this view"
          description="Try a different filter to see more matches."
        />
      ) : (
        grouped.map(([day, items]) => (
          <section key={day} className="space-y-3">
            <h2 className="px-1 text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {formatDay(items[0].kickoff_at)}
            </h2>
            <div className="space-y-3">
              {items.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  teamById={teamById}
                  playerId={playerId}
                  groupId={group.id}
                  existing={predByMatch.get(m.id)}
                  onSaved={handleSaved}
                  groupPicks={publicByMatch.get(m.id)}
                  nameById={nameById}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <AutoFillModal
        open={autoFillOpen}
        onClose={() => setAutoFillOpen(false)}
        matches={matches}
        teams={teams}
        playerId={playerId}
        groupId={group.id}
        onComplete={handleAutoFilled}
      />

      <ImportPicksModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        playerId={playerId}
        destGroupId={group.id}
        destGroupName={group.name}
        onComplete={async ({ matches: m, outrights: o }) => {
          // Re-fetch the player's now-updated predictions.
          const fresh = await getMyMatchPredictions(playerId, group.id).catch(
            () => [] as MatchPrediction[],
          );
          setPredictions(fresh);
          if (m === 0 && o === 0) {
            alert(
              "No picks were imported — only matches that hadn't kicked off when this group was created can carry over, and none of your source picks qualified.",
            );
          } else {
            alert(
              `Imported ${m} match prediction${m === 1 ? "" : "s"} and ${o} outright bet${
                o === 1 ? "" : "s"
              }. (Only picks for matches that hadn't kicked off when this group was created.)`,
            );
          }
        }}
      />
    </div>
  );
}
const CALLOUT_KEY = "wc-fantasy-howto-dismissed";
const AWARDS_CALLOUT_KEY = "wc-fantasy-awards-announced";

function HowToPlayCallout() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(CALLOUT_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  function dismiss() {
    try {
      localStorage.setItem(CALLOUT_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">❓</span>
        <span>
          New here? Read{" "}
          <Link to="/how" className="font-bold underline">
            How to play
          </Link>{" "}
          — scoring rules + outright bets in 30 seconds.
        </span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-md px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-500/20"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function NewAwardsCallout({ outrightsPath }: { outrightsPath: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(AWARDS_CALLOUT_KEY) === "1";
    } catch {
      return false;
    }
  });
  if (dismissed) return null;
  function dismiss() {
    try {
      localStorage.setItem(AWARDS_CALLOUT_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">🆕</span>
        <span>
          New predictions! Call the <strong>Top Goal Scorer</strong> and{" "}
          <strong>Top Player</strong> — <strong>+10 pts each</strong>. Set yours on the{" "}
          <Link to={outrightsPath} className="font-bold underline">
            Outrights
          </Link>{" "}
          page before they lock Monday.
        </span>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="rounded-md px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
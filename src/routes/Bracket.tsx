import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getAllMatches, getAllTeams } from "../lib/api";
import type { Match, Team } from "../lib/types";
import { EmptyState, Spinner } from "../components/Primitives";
import { STAGE_LABEL } from "../lib/scoring";
import { formatKickoff } from "../lib/timezone";
import { cx } from "../lib/utils";
import type { GroupContext } from "./GroupLayout";

const ROUND_ORDER = ["R32", "R16", "QF", "SF", "FINAL", "THIRD"] as const;

export function Bracket() {
  const { group } = useOutletContext<GroupContext>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [m, t] = await Promise.all([getAllMatches(), getAllTeams()]);
      if (cancelled) return;
      setMatches(m);
      setTeams(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const koMatches = useMemo(
    () => matches.filter((m) => m.stage !== "GROUP").sort((a, b) => a.id - b.id),
    [matches],
  );

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-base font-semibold">Tournament bracket</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          The live knockout tree. Predict each match individually from the{" "}
          <strong>Matches</strong> tab; this view fills in once teams qualify.
        </p>
      </div>

      {ROUND_ORDER.map((round) => {
        const items = koMatches.filter((m) => m.stage === round);
        if (items.length === 0) return null;
        return (
          <section key={round} className="space-y-2">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {STAGE_LABEL[round]}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((m) => (
                <BracketRow key={m.id} match={m} teamById={teamById} />
              ))}
            </div>
          </section>
        );
      })}

      {koMatches.length === 0 && (
        <EmptyState title="Bracket not available" description="The KO matches haven't been seeded." />
      )}
    </div>
  );
}

function BracketRow({ match, teamById }: { match: Match; teamById: Map<string, Team> }) {
  const home = match.home_team_id ? teamById.get(match.home_team_id) : undefined;
  const away = match.away_team_id ? teamById.get(match.away_team_id) : undefined;

  const finished = match.status === "FINISHED";
  const winnerId =
    finished && match.home_score != null && match.away_score != null
      ? match.home_score > match.away_score
        ? match.home_team_id
        : match.away_score > match.home_score
          ? match.away_team_id
          : null
      : null;

  return (
    <article className="card !p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span>#{match.id}</span>
        <span>{formatKickoff(match.kickoff_at)}</span>
      </div>
      <div className="mt-1 space-y-1 text-sm">
        <TeamLine
          team={home}
          placeholder={match.home_placeholder ?? "TBD"}
          isWinner={winnerId === match.home_team_id}
          score={finished ? match.home_score : null}
        />
        <TeamLine
          team={away}
          placeholder={match.away_placeholder ?? "TBD"}
          isWinner={winnerId === match.away_team_id}
          score={finished ? match.away_score : null}
        />
      </div>
    </article>
  );
}

function TeamLine({
  team,
  placeholder,
  isWinner,
  score,
}: {
  team: Team | undefined;
  placeholder: string;
  isWinner: boolean;
  score: number | null;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-md px-2 py-1.5",
        isWinner && "bg-emerald-50 dark:bg-emerald-500/15",
      )}
    >
      <span className="text-lg">{team?.flag_emoji ?? "\u{1F3F3}\u{FE0F}"}</span>
      <span className="flex-1 truncate font-medium">{team?.name ?? placeholder}</span>
      {score != null && <span className="font-bold tabular-nums">{score}</span>}
    </div>
  );
}

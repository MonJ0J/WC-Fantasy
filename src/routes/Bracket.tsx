import { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { getAllMatches, getAllTeams, getMyBracket } from "../lib/api";
import type { BracketPrediction, Match, Team } from "../lib/types";
import { EmptyState, Spinner } from "../components/Primitives";
import { STAGE_LABEL } from "../lib/scoring";
import { formatKickoff } from "../lib/timezone";
import { cx } from "../lib/utils";
import type { GroupContext } from "./GroupLayout";

const ROUND_ORDER = ["R32", "R16", "QF", "SF", "FINAL", "THIRD"] as const;

export function Bracket() {
  const { group, playerId } = useOutletContext<GroupContext>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [picks, setPicks] = useState<BracketPrediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [m, t, p] = await Promise.all([
        getAllMatches(),
        getAllTeams(),
        getMyBracket(playerId, group.id).catch(() => [] as BracketPrediction[]),
      ]);
      if (cancelled) return;
      setMatches(m);
      setTeams(t);
      setPicks(p);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id, playerId]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const pickBySlot = useMemo(
    () => new Map(picks.map((p) => [p.bracket_slot, p.predicted_team_id])),
    [picks],
  );

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

  const koStarted = matches.some((m) => m.id === 73 && new Date(m.kickoff_at).getTime() <= Date.now());

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Knockout bracket</h2>
          <p className="text-xs text-slate-500">
            Pre-tournament bracket lock-in opens once the group stage seeds are confirmed. Coming
            in Phase 2 of WC-Fantasy.
          </p>
        </div>
        <Link to={`/g/${group.invite_code}/bracket/build`} className="btn-secondary !py-2 text-xs">
          {koStarted ? "View my picks" : "Build my bracket"}
        </Link>
      </div>

      {ROUND_ORDER.map((round) => {
        const items = koMatches.filter((m) => m.stage === round);
        if (items.length === 0) return null;
        return (
          <section key={round} className="space-y-2">
            <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              {STAGE_LABEL[round]}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((m) => (
                <BracketRow
                  key={m.id}
                  match={m}
                  teamById={teamById}
                  myPickId={pickBySlot.get(m.bracket_slot ?? -1)}
                />
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

function BracketRow({
  match,
  teamById,
  myPickId,
}: {
  match: Match;
  teamById: Map<string, Team>;
  myPickId: string | undefined;
}) {
  const home = match.home_team_id ? teamById.get(match.home_team_id) : undefined;
  const away = match.away_team_id ? teamById.get(match.away_team_id) : undefined;
  const myPick = myPickId ? teamById.get(myPickId) : undefined;

  const finished = match.status === "FINISHED";
  const winnerId =
    finished && match.home_score != null && match.away_score != null
      ? match.home_score > match.away_score
        ? match.home_team_id
        : match.away_score > match.home_score
          ? match.away_team_id
          : null
      : null;
  const correct = finished && myPickId != null && myPickId === winnerId;
  const wrong = finished && myPickId != null && myPickId !== winnerId;

  return (
    <article className="card !p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>#{match.id}</span>
        <span>{formatKickoff(match.kickoff_at)}</span>
      </div>
      <div className="mt-1 space-y-1 text-sm">
        <TeamLine
          team={home}
          placeholder={match.home_placeholder ?? "TBD"}
          isWinner={winnerId === match.home_team_id}
          isMyPick={myPickId === match.home_team_id}
        />
        <TeamLine
          team={away}
          placeholder={match.away_placeholder ?? "TBD"}
          isWinner={winnerId === match.away_team_id}
          isMyPick={myPickId === match.away_team_id}
        />
      </div>
      {myPick && (
        <p
          className={cx(
            "mt-2 text-xs",
            correct ? "text-emerald-700" : wrong ? "text-red-600" : "text-slate-600",
          )}
        >
          Your pick: <strong>{myPick.flag_emoji} {myPick.name}</strong>
          {finished && (correct ? " ✓" : " ✗")}
        </p>
      )}
    </article>
  );
}

function TeamLine({
  team,
  placeholder,
  isWinner,
  isMyPick,
}: {
  team: Team | undefined;
  placeholder: string;
  isWinner: boolean;
  isMyPick: boolean;
}) {
  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-md px-2 py-1.5",
        isWinner && "bg-emerald-50",
        isMyPick && !isWinner && "ring-1 ring-brand-300",
      )}
    >
      <span className="text-lg">{team?.flag_emoji ?? "🏳️"}</span>
      <span className="flex-1 truncate font-medium">{team?.name ?? placeholder}</span>
      {isMyPick && <span className="text-[10px] font-semibold text-brand-600">YOUR PICK</span>}
    </div>
  );
}

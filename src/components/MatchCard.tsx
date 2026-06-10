import type { Match, MatchPrediction, Team } from "../lib/types";
import { actualOutcome, scorePrediction, STAGE_LABEL } from "../lib/scoring";
import { formatKickoff, isLocked, isStarted, relativeKickoff, relativeLock } from "../lib/timezone";
import { cx } from "../lib/utils";
import { StatusPill } from "./Primitives";
import { PredictionWidget } from "./PredictionWidget";

interface Props {
  match: Match;
  teamById: Map<string, Team>;
  playerId: string;
  groupId: string;
  existing: MatchPrediction | undefined;
  onSaved: (pred: MatchPrediction) => void;
}

export function MatchCard({ match, teamById, playerId, groupId, existing, onSaved }: Props) {
  const home = match.home_team_id ? teamById.get(match.home_team_id) : undefined;
  const away = match.away_team_id ? teamById.get(match.away_team_id) : undefined;

  const homeLabel = home?.name ?? match.home_placeholder ?? "TBD";
  const awayLabel = away?.name ?? match.away_placeholder ?? "TBD";
  const homeFlag = home?.flag_emoji ?? "🏳️";
  const awayFlag = away?.flag_emoji ?? "🏳️";

  const finished = match.status === "FINISHED";
  const started = isStarted(match.kickoff_at) && !finished;
  const locked = isLocked(match.kickoff_at);

  const myPoints = finished ? scorePrediction(match, existing) : null;
  const actual = actualOutcome(match);

  return (
    <article className="card transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="font-semibold">#{match.id}</span>
          <span>·</span>
          <span>{STAGE_LABEL[match.stage]}</span>
          {match.group_letter && (
            <>
              <span>·</span>
              <span>Group {match.group_letter}</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {finished && <StatusPill status="finished">Final</StatusPill>}
          {started && !finished && <StatusPill status="live">Live</StatusPill>}
          {!started && !finished && locked && <StatusPill status="locked">🔒 Locked</StatusPill>}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <TeamRow flag={homeFlag} name={homeLabel} side="home" highlight={actual === "HOME"} />
        <div className="flex flex-col items-center">
          {finished ? (
            <div className="text-2xl font-bold tabular-nums">
              {match.home_score} <span className="text-slate-400">–</span> {match.away_score}
            </div>
          ) : (
            <div className="text-xs font-medium uppercase tracking-wider text-slate-400">vs</div>
          )}
          <div className="mt-1 text-[11px] text-slate-500">{formatKickoff(match.kickoff_at)}</div>
          <div className="text-[11px] text-slate-400">
            {finished
              ? match.venue
              : started
                ? "started"
                : locked
                  ? relativeKickoff(match.kickoff_at)
                  : relativeLock(match.kickoff_at)}
          </div>
        </div>
        <TeamRow flag={awayFlag} name={awayLabel} side="away" highlight={actual === "AWAY"} />
      </div>

      {existing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-500">Your pick:</span>
          <span className="font-medium">
            {existing.predicted_outcome === "HOME"
              ? `${homeLabel} win`
              : existing.predicted_outcome === "AWAY"
                ? `${awayLabel} win`
                : "Draw"}
          </span>
          {existing.predicted_home_score != null && existing.predicted_away_score != null && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-slate-700">
              {existing.predicted_home_score}–{existing.predicted_away_score}
            </span>
          )}
          {myPoints != null && (
            <span
              className={cx(
                "ml-auto rounded-md px-2 py-0.5 font-bold",
                myPoints > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500",
              )}
            >
              {myPoints > 0 ? `+${myPoints} pts` : "0 pts"}
            </span>
          )}
        </div>
      )}

      {match.stage === "GROUP" && match.home_team_id && match.away_team_id && (
        <PredictionWidget
          match={match}
          homeTeam={home}
          awayTeam={away}
          playerId={playerId}
          groupId={groupId}
          existing={existing}
          onSaved={onSaved}
        />
      )}
    </article>
  );
}

function TeamRow({
  flag,
  name,
  side,
  highlight,
}: {
  flag: string;
  name: string;
  side: "home" | "away";
  highlight: boolean;
}) {
  return (
    <div
      className={cx(
        "flex flex-1 items-center gap-2",
        side === "away" && "flex-row-reverse text-right",
      )}
    >
      <span className="text-2xl leading-none">{flag}</span>
      <span
        className={cx(
          "line-clamp-2 text-sm font-semibold",
          highlight ? "text-emerald-700" : "text-slate-900",
        )}
      >
        {name}
      </span>
    </div>
  );
}

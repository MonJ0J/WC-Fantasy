import { useState } from "react";
import type {
  Match,
  PredictionOutcome,
  PublicMatchPrediction,
  Team,
} from "../lib/types";
import { actualOutcome, scorePrediction } from "../lib/scoring";
import { cx } from "../lib/utils";

interface Props {
  match: Match;
  picks: PublicMatchPrediction[];
  nameById: Map<string, string>;
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  myPlayerId: string;
}

/**
 * Renders every group member's prediction for a match that has already kicked
 * off. Picks are only revealed by the SQL view once kickoff has passed, so
 * this component should only be mounted in that state — but we double-guard
 * by returning null if `picks` is empty (also catches groups with no picks yet).
 */
export function GroupPicks({
  match,
  picks,
  nameById,
  homeTeam,
  awayTeam,
  myPlayerId,
}: Props) {
  const [open, setOpen] = useState(false);

  if (picks.length === 0) return null;

  const homeFlag = homeTeam?.flag_emoji ?? "🏳️";
  const awayFlag = awayTeam?.flag_emoji ?? "🏳️";
  const homeName = homeTeam?.name ?? "Home";
  const awayName = awayTeam?.name ?? "Away";

  const actual = actualOutcome(match);
  const sorted = picks
    .slice()
    .sort((a, b) => {
      const nameA = nameById.get(a.player_id) ?? "—";
      const nameB = nameById.get(b.player_id) ?? "—";
      // Pin the current user to the top.
      if (a.player_id === myPlayerId) return -1;
      if (b.player_id === myPlayerId) return 1;
      return nameA.localeCompare(nameB);
    });

  return (
    <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        <span>
          Group picks{" "}
          <span className="font-normal text-slate-500 dark:text-slate-400">
            ({picks.length})
          </span>
        </span>
        <span aria-hidden className="text-base leading-none">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5 text-xs">
          {sorted.map((p) => {
            const name = nameById.get(p.player_id) ?? "—";
            const isMe = p.player_id === myPlayerId;
            const correctOutcome =
              actual != null && p.predicted_outcome === actual;
            const exactScore =
              actual != null &&
              correctOutcome &&
              p.predicted_home_score != null &&
              p.predicted_away_score != null &&
              p.predicted_home_score === match.home_score &&
              p.predicted_away_score === match.away_score;
            const earned =
              match.status === "FINISHED" ? scorePrediction(match, p) : null;
            return (
              <li
                key={`${p.match_id}-${p.player_id}`}
                className={cx(
                  "flex items-center gap-2 rounded-md px-2 py-1",
                  isMe
                    ? "bg-brand-50 font-semibold dark:bg-brand-500/15"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/40",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {name}
                  {isMe && (
                    <span className="ml-1 text-[10px] font-normal text-brand-600 dark:text-brand-300">
                      (you)
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  <OutcomeBadge
                    outcome={p.predicted_outcome}
                    homeFlag={homeFlag}
                    awayFlag={awayFlag}
                    homeName={homeName}
                    awayName={awayName}
                    correct={correctOutcome}
                  />
                  {p.predicted_home_score != null && p.predicted_away_score != null && (
                    <span
                      className={cx(
                        "rounded-md px-1.5 py-0.5 font-mono tabular-nums text-[11px]",
                        exactScore
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
                      )}
                    >
                      {p.predicted_home_score}–{p.predicted_away_score}
                    </span>
                  )}
                </span>
                {earned != null && (
                  <span
                    className={cx(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                      earned > 0
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                    )}
                  >
                    {earned > 0 ? `+${earned}` : "0"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function OutcomeBadge({
  outcome,
  homeFlag,
  awayFlag,
  homeName,
  awayName,
  correct,
}: {
  outcome: PredictionOutcome;
  homeFlag: string;
  awayFlag: string;
  homeName: string;
  awayName: string;
  correct: boolean;
}) {
  let body: React.ReactNode;
  if (outcome === "HOME") body = <>{homeFlag} {abbr(homeName)}</>;
  else if (outcome === "AWAY") body = <>{awayFlag} {abbr(awayName)}</>;
  else body = "Draw";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
        correct
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300"
          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      )}
    >
      {body}
    </span>
  );
}

function abbr(name: string): string {
  // Trim long names for tight rows.
  if (name.length <= 12) return name;
  const parts = name.split(/\s+/);
  if (parts.length > 1) {
    return parts[0].slice(0, 11);
  }
  return name.slice(0, 11) + "…";
}

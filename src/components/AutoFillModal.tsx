import { useMemo, useState } from "react";
import { submitMatchPrediction } from "../lib/api";
import type { Match, MatchPrediction, PredictionOutcome, Team } from "../lib/types";
import { isLocked } from "../lib/timezone";
import { Spinner } from "./Primitives";
import { cx } from "../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  matches: Match[];
  teams: Team[];
  playerId: string;
  groupId: string;
  /** Called once filling completes; parent should re-fetch its predictions. */
  onComplete: (saved: MatchPrediction[]) => void;
}

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;

/**
 * Random-pick assistant for the group stage.
 *
 * User picks which teams they think advance from each group; we fill in
 * predictions for every still-unlocked group match such that:
 *   - if both teams are "selected", the match is a DRAW (both get a point);
 *   - if exactly one is selected, that team wins;
 *   - if neither is selected, we coin-flip HOME vs AWAY.
 *
 * No score is set — the player can add exact-score guesses later for bonus
 * points.
 */
export function AutoFillModal({
  open,
  onClose,
  matches,
  teams,
  playerId,
  groupId,
  onComplete,
}: Props) {
  const [selected, setSelected] = useState<Map<string, Set<string>>>(new Map());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const teamsByGroup = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const t of teams) {
      if (!t.group_letter) continue;
      const arr = map.get(t.group_letter) ?? [];
      arr.push(t);
      map.set(t.group_letter, arr);
    }
    return map;
  }, [teams]);

  const groupMatches = useMemo(
    () => matches.filter((m) => m.stage === "GROUP" && !isLocked(m.kickoff_at)),
    [matches],
  );

  function toggle(letter: string, teamId: string) {
    setSelected((cur) => {
      const next = new Map(cur);
      const set = new Set(next.get(letter) ?? []);
      if (set.has(teamId)) set.delete(teamId);
      else set.add(teamId);
      next.set(letter, set);
      return next;
    });
  }

  const totalSelected = Array.from(selected.values()).reduce((acc, s) => acc + s.size, 0);

  async function run() {
    if (groupMatches.length === 0) {
      setError("No upcoming group-stage matches to fill.");
      return;
    }
    if (
      !window.confirm(
        `This will overwrite your existing predictions for ${groupMatches.length} group-stage matches. Continue?`,
      )
    ) {
      return;
    }

    setRunning(true);
    setError(null);
    setProgress({ done: 0, total: groupMatches.length });

    const saved: MatchPrediction[] = [];
    let done = 0;
    const failures: number[] = [];

    // Run in small parallel batches to avoid hammering Supabase.
    const batchSize = 6;
    for (let i = 0; i < groupMatches.length; i += batchSize) {
      const chunk = groupMatches.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        chunk.map(async (m) => {
          const letter = m.group_letter ?? "";
          const set = selected.get(letter);
          const homeSel = !!(m.home_team_id && set?.has(m.home_team_id));
          const awaySel = !!(m.away_team_id && set?.has(m.away_team_id));
          let outcome: PredictionOutcome;
          if (homeSel && awaySel) outcome = "DRAW";
          else if (homeSel) outcome = "HOME";
          else if (awaySel) outcome = "AWAY";
          else outcome = Math.random() < 0.5 ? "HOME" : "AWAY";

          await submitMatchPrediction({
            playerId,
            groupId,
            matchId: m.id,
            outcome,
          });
          saved.push({
            match_id: m.id,
            predicted_outcome: outcome,
            predicted_home_score: null,
            predicted_away_score: null,
          });
        }),
      );
      for (let k = 0; k < results.length; k++) {
        if (results[k].status === "rejected") failures.push(chunk[k].id);
      }
      done += chunk.length;
      setProgress({ done, total: groupMatches.length });
    }

    setRunning(false);
    if (failures.length > 0) {
      setError(`Filled ${saved.length}/${groupMatches.length}. ${failures.length} matches could not be saved.`);
    } else {
      onComplete(saved);
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">🎲 Auto-fill picks</h2>
              <p className="mt-1 text-xs text-slate-600">
                Tap the teams you think will advance from each group. We'll fill in your predictions
                so those teams come out on top.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-xl leading-none text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {GROUP_LETTERS.map((letter) => {
            const set = selected.get(letter);
            return (
              <div key={letter} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="text-sm font-bold">Group {letter}</h3>
                  <span className="text-[11px] text-slate-500">
                    {set?.size ?? 0} of 4 selected
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(teamsByGroup.get(letter) ?? []).map((t) => {
                    const isSel = set?.has(t.id) ?? false;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(letter, t.id)}
                        className={cx(
                          "flex items-center gap-2 rounded-lg border px-2 py-2 text-xs font-medium transition",
                          isSel
                            ? "border-brand-500 bg-brand-50 text-brand-900 ring-1 ring-brand-300"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                        )}
                      >
                        <span className="text-base leading-none">{t.flag_emoji}</span>
                        <span className="flex-1 text-left">{t.name}</span>
                        {isSel && <span className="text-brand-600">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
          <span className="text-xs text-slate-500">
            {totalSelected} team{totalSelected === 1 ? "" : "s"} selected
            {progress && ` · ${progress.done}/${progress.total} saved`}
          </span>
          <button
            onClick={onClose}
            disabled={running}
            className="btn-ghost ml-auto !py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={() => void run()}
            disabled={running}
            className="btn-primary !py-1.5 text-xs"
          >
            {running ? (
              <Spinner className="h-4 w-4" />
            ) : (
              `Fill ${groupMatches.length} matches`
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

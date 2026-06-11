import { useEffect, useState } from "react";
import { submitMatchPrediction } from "../lib/api";
import type { Match, MatchPrediction, PredictionOutcome, Team } from "../lib/types";
import { isKnockout, STAGE_EXACT_BONUS, STAGE_OUTCOME_POINTS } from "../lib/scoring";
import { isLocked, isStarted } from "../lib/timezone";
import { cx } from "../lib/utils";
import { Spinner } from "./Primitives";

interface Props {
  match: Match;
  homeTeam: Team | undefined;
  awayTeam: Team | undefined;
  playerId: string;
  groupId: string;
  existing: MatchPrediction | undefined;
  onSaved: (pred: MatchPrediction) => void;
}

const OPTIONS: Array<{ value: PredictionOutcome; key: string }> = [
  { value: "HOME", key: "1" },
  { value: "DRAW", key: "X" },
  { value: "AWAY", key: "2" },
];

export function PredictionWidget({
  match,
  homeTeam,
  awayTeam,
  playerId,
  groupId,
  existing,
  onSaved,
}: Props) {
  const ko = isKnockout(match.stage);
  const options = ko ? OPTIONS.filter((o) => o.value !== "DRAW") : OPTIONS;
  const [outcome, setOutcome] = useState<PredictionOutcome | null>(
    existing?.predicted_outcome ?? null,
  );
  const [home, setHome] = useState<string>(
    existing?.predicted_home_score?.toString() ?? "",
  );
  const [away, setAway] = useState<string>(
    existing?.predicted_away_score?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setOutcome(existing?.predicted_outcome ?? null);
    setHome(existing?.predicted_home_score?.toString() ?? "");
    setAway(existing?.predicted_away_score?.toString() ?? "");
  }, [existing?.predicted_outcome, existing?.predicted_home_score, existing?.predicted_away_score]);

  const locked = isLocked(match.kickoff_at) || isStarted(match.kickoff_at);

  // Auto-derive outcome from score if scores entered and outcome unset.
  useEffect(() => {
    if (home === "" || away === "") return;
    const h = Number(home);
    const a = Number(away);
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    if (h === a) {
      // Equal scores: GROUP → derive DRAW; KO → don't touch (user must
      // pick the PK winner explicitly).
      if (!ko) setOutcome((cur) => (cur === "DRAW" ? cur : "DRAW"));
      return;
    }
    const derived: PredictionOutcome = h > a ? "HOME" : "AWAY";
    setOutcome((cur) => (cur && cur !== derived ? cur : derived));
  }, [home, away, ko]);

  async function save(nextOutcome: PredictionOutcome | null) {
    if (locked) return;
    const chosen = nextOutcome ?? outcome;
    if (!chosen) return;

    const h = home === "" ? null : Number(home);
    const a = away === "" ? null : Number(away);
    if (
      (h != null && (Number.isNaN(h) || h < 0 || h > 20)) ||
      (a != null && (Number.isNaN(a) || a < 0 || a > 20))
    ) {
      setError("Scores must be between 0 and 20");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await submitMatchPrediction({
        playerId,
        groupId,
        matchId: match.id,
        outcome: chosen,
        homeScore: h,
        awayScore: a,
      });
      onSaved({
        match_id: match.id,
        predicted_outcome: chosen,
        predicted_home_score: h,
        predicted_away_score: a,
      });
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (locked) return null;

  const homeName = homeTeam?.name ?? match.home_placeholder ?? "Home";
  const awayName = awayTeam?.name ?? match.away_placeholder ?? "Away";

  return (
    <div className="mt-3 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-3">
      <div className={cx("grid gap-2", ko ? "grid-cols-2" : "grid-cols-3")}>
        {options.map((opt) => {
          const active = outcome === opt.value;
          const label =
            opt.value === "HOME" ? homeName : opt.value === "AWAY" ? awayName : "Draw";
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                setOutcome(opt.value);
                void save(opt.value);
              }}
              disabled={saving}
              className={cx(
                "rounded-xl border px-2 py-2 text-xs font-semibold transition",
                active
                  ? "border-brand-500 bg-brand-50 text-brand-700 ring-2 ring-brand-300 dark:bg-brand-500/15 dark:text-brand-300 dark:ring-brand-500/40"
                  : "border-slate-200 bg-white text-slate-700 dark:text-slate-300 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700",
              )}
            >
              <span className="block text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {opt.key}
              </span>
              <span className="line-clamp-1">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <ScoreInput value={home} onChange={setHome} ariaLabel={`${homeName} score`} />
          <span className="text-slate-400">–</span>
          <ScoreInput value={away} onChange={setAway} ariaLabel={`${awayName} score`} />
          <button
            type="button"
            onClick={() => void save(null)}
            disabled={saving || !outcome}
            className="btn-secondary !px-3 !py-1.5 !text-xs"
          >
            {saving ? <Spinner className="h-4 w-4" /> : "Save score"}
          </button>
        </div>
        {savedAt && !saving && !error && (
          <span className="text-xs text-emerald-600">Saved ✓</span>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <p className="text-xs text-slate-500 dark:text-slate-400">
        +{STAGE_OUTCOME_POINTS[match.stage]} pts for the right outcome
        {STAGE_EXACT_BONUS[match.stage] > 0
          ? `, +${STAGE_EXACT_BONUS[match.stage]} bonus if your exact score also matches`
          : ""}
        .
        {ko && " Score is the result at the end of regulation; PK winners count as the outcome."}
      </p>
    </div>
  );
}

function ScoreInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
        onChange(v);
      }}
      className="h-9 w-12 rounded-lg border border-slate-300 dark:border-slate-700 bg-white text-center text-base font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:bg-slate-800 dark:text-slate-100"
    />
  );
}

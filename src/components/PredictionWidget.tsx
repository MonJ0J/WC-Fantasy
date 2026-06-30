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
  const [penalties, setPenalties] = useState<boolean>(
    existing?.predicted_penalties ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setOutcome(existing?.predicted_outcome ?? null);
    setHome(existing?.predicted_home_score?.toString() ?? "");
    setAway(existing?.predicted_away_score?.toString() ?? "");
    setPenalties(existing?.predicted_penalties ?? false);
  }, [
    existing?.predicted_outcome,
    existing?.predicted_home_score,
    existing?.predicted_away_score,
    existing?.predicted_penalties,
  ]);

  const locked = isLocked(match.kickoff_at) || isStarted(match.kickoff_at);

  /** Compute the outcome that scores imply, or null if scores are incomplete. */
  function outcomeFromScores(): PredictionOutcome | null {
    if (home === "" || away === "") return null;
    const h = Number(home);
    const a = Number(away);
    if (Number.isNaN(h) || Number.isNaN(a)) return null;
    if (h > a) return "HOME";
    if (h < a) return "AWAY";
    return "DRAW";
  }

  /**
   * Auto-derive outcome from scores 1 second after the user stops typing.
   * The debounce prevents the UI from flipping to DRAW mid-edit (e.g. while
   * the user is changing 2-1 to 3-1 and the away digit is briefly blank).
   * For KO matches a tied score doesn't auto-pick — user must click HOME or
   * AWAY explicitly to indicate the PK winner.
   */
  useEffect(() => {
    if (home === "" || away === "") return;
    const t = setTimeout(() => {
      const derived = outcomeFromScores();
      if (derived == null) return;
      if (ko && derived === "DRAW") return;
      setOutcome((cur) => (cur === derived ? cur : derived));
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away, ko]);

  function clearScores() {
    setHome("");
    setAway("");
  }

  async function save(nextOutcome: PredictionOutcome | null, nextPenalties?: boolean) {
    if (locked) return;

    const usePenalties = nextPenalties ?? penalties;

    // When predicting penalties, scores are not submitted.
    const h = usePenalties ? null : home === "" ? null : Number(home);
    const a = usePenalties ? null : away === "" ? null : Number(away);
    if (
      (h != null && (Number.isNaN(h) || h < 0 || h > 20)) ||
      (a != null && (Number.isNaN(a) || a < 0 || a > 20))
    ) {
      setError("Scores must be between 0 and 20");
      return;
    }

    // Scores are the source of truth. If both are filled, the outcome must
    // match. For KO matches, a tied score keeps the user-selected outcome
    // (HOME/AWAY = the PK winner) since draws aren't allowed there.
    let chosen: PredictionOutcome | null;
    if (usePenalties) {
      // Penalties bet: user must pick a winner explicitly (HOME or AWAY).
      chosen = nextOutcome ?? outcome;
    } else if (h != null && a != null) {
      if (h > a) chosen = "HOME";
      else if (h < a) chosen = "AWAY";
      else if (ko) chosen = nextOutcome ?? outcome;
      else chosen = "DRAW";
    } else {
      chosen = nextOutcome ?? outcome;
    }
    if (!chosen) return;

    // Reflect the reconciled outcome immediately so the UI matches what saved.
    if (chosen !== outcome) setOutcome(chosen);

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
        predictedPenalties: usePenalties,
      });
      onSaved({
        match_id: match.id,
        predicted_outcome: chosen,
        predicted_home_score: h,
        predicted_away_score: a,
        predicted_penalties: usePenalties,
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
          <ScoreInput
            value={penalties ? "" : home}
            onChange={setHome}
            ariaLabel={`${homeName} score`}
            disabled={penalties}
          />
          <span className="text-slate-400">–</span>
          <ScoreInput
            value={penalties ? "" : away}
            onChange={setAway}
            ariaLabel={`${awayName} score`}
            disabled={penalties}
          />
          <button
            type="button"
            onClick={() => void save(null)}
            disabled={saving || !outcome}
            className="btn-secondary !px-3 !py-1.5 !text-xs"
          >
            {saving ? <Spinner className="h-4 w-4" /> : "Save score"}
          </button>
          {!penalties && (home !== "" || away !== "") && (
            <button
              type="button"
              onClick={clearScores}
              disabled={saving}
              className="text-xs text-slate-500 hover:text-slate-700 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
              title="Clear scores (keeps your outcome pick)"
            >
              Clear
            </button>
          )}
        </div>
        {savedAt && !saving && !error && (
          <span className="text-xs text-emerald-600">Saved ✓</span>
        )}
      </div>

      {ko && (
        <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800">
          <input
            type="checkbox"
            checked={penalties}
            disabled={saving}
            onChange={(e) => {
              const next = e.target.checked;
              setPenalties(next);
              if (next) {
                setHome("");
                setAway("");
              }
              if (outcome) void save(outcome, next);
            }}
            className="h-4 w-4 rounded border-slate-400 text-brand-600 focus:ring-brand-500"
          />
          <span>
            Goes to penalties
            <span className="ml-1 text-slate-500 dark:text-slate-400">
              (no exact score; +{STAGE_EXACT_BONUS[match.stage]} bonus if it goes to PKs, even
              if you miss the winner)
            </span>
          </span>
        </label>
      )}

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
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <input
      aria-label={ariaLabel}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
        onChange(v);
      }}
      className="h-9 w-12 rounded-lg border border-slate-300 dark:border-slate-700 bg-white text-center text-base font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:bg-slate-800 dark:text-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:disabled:bg-slate-900 dark:disabled:text-slate-600"
    />
  );
}

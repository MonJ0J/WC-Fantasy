import type { Match, MatchPrediction, MatchStage, PredictionOutcome } from "./types";

export const STAGE_LABEL: Record<MatchStage, string> = {
  GROUP: "Group stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarterfinals",
  SF: "Semifinals",
  THIRD: "Third place",
  FINAL: "Final",
};

export const KO_POINTS: Record<Exclude<MatchStage, "GROUP" | "THIRD">, number> = {
  R32: 5,
  R16: 10,
  QF: 15,
  SF: 20,
  FINAL: 25,
};

export const GROUP_OUTCOME_POINTS = 3;
export const GROUP_EXACT_SCORE_BONUS = 2;

export function actualOutcome(match: Match): PredictionOutcome | null {
  if (match.home_score == null || match.away_score == null) return null;
  if (match.home_score > match.away_score) return "HOME";
  if (match.home_score < match.away_score) return "AWAY";
  return "DRAW";
}

/**
 * Client-side score preview for a single group-stage prediction.
 * Mirrors the authoritative SQL `recalc_scores()` logic.
 */
export function scorePrediction(match: Match, pred: MatchPrediction | undefined): number {
  if (!pred) return 0;
  const actual = actualOutcome(match);
  if (actual == null) return 0;

  let pts = 0;
  if (pred.predicted_outcome === actual) pts += GROUP_OUTCOME_POINTS;
  if (
    pred.predicted_home_score != null &&
    pred.predicted_away_score != null &&
    pred.predicted_home_score === match.home_score &&
    pred.predicted_away_score === match.away_score
  ) {
    pts += GROUP_EXACT_SCORE_BONUS;
  }
  return pts;
}

export function outcomeLabel(o: PredictionOutcome, home: string, away: string): string {
  switch (o) {
    case "HOME":
      return `${home} win`;
    case "DRAW":
      return "Draw";
    case "AWAY":
      return `${away} win`;
  }
}

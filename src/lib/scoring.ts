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

/** Outcome (correct W/D/L) point values per stage. */
export const STAGE_OUTCOME_POINTS: Record<MatchStage, number> = {
  GROUP: 3,
  R32: 5,
  R16: 8,
  QF: 12,
  SF: 18,
  THIRD: 10,
  FINAL: 25,
};

/** Exact-score bonus (added on top when outcome is also correct). */
export const STAGE_EXACT_BONUS: Record<MatchStage, number> = {
  GROUP: 2,
  R32: 3,
  R16: 5,
  QF: 8,
  SF: 10,
  THIRD: 0,
  FINAL: 15,
};

export const OUTRIGHT_POINTS = {
  CHAMPION: 50,
  RUNNER_UP: 30,
  GROUP_WINNER: 5,
  SEMIFINALIST: 10,
  UNDERPERFORMER: 20,
} as const;

export function isKnockout(stage: MatchStage): boolean {
  return stage !== "GROUP";
}

export function actualOutcome(match: Match): PredictionOutcome | null {
  if (match.home_score == null || match.away_score == null) return null;
  if (match.home_score > match.away_score) return "HOME";
  if (match.home_score < match.away_score) return "AWAY";
  // KO matches can't end in a true draw at the leaderboard level, but the
  // PK winner is captured server-side via winner_team_id; client previews
  // fall back to DRAW for the score-only case.
  return "DRAW";
}

/**
 * Client-side score preview for a single prediction. The authoritative score
 * is computed in SQL by `recalc_scores()`.
 */
export function scorePrediction(match: Match, pred: MatchPrediction | undefined): number {
  if (!pred) return 0;
  const actual = actualOutcome(match);
  if (actual == null) return 0;
  if (isKnockout(match.stage) && actual === "DRAW") return 0;

  let pts = 0;
  if (pred.predicted_outcome === actual) pts += STAGE_OUTCOME_POINTS[match.stage];
  if (
    pred.predicted_outcome === actual &&
    pred.predicted_home_score != null &&
    pred.predicted_away_score != null &&
    pred.predicted_home_score === match.home_score &&
    pred.predicted_away_score === match.away_score
  ) {
    pts += STAGE_EXACT_BONUS[match.stage];
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

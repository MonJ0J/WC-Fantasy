export type MatchStage = "GROUP" | "R32" | "R16" | "QF" | "SF" | "THIRD" | "FINAL";
export type MatchStatus = "SCHEDULED" | "LIVE" | "FINISHED";
export type PredictionOutcome = "HOME" | "DRAW" | "AWAY";

export interface Team {
  id: string;
  name: string;
  flag_emoji: string;
  group_letter: string | null;
  seed_position: number | null;
}

export interface Match {
  id: number;
  stage: MatchStage;
  group_letter: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_placeholder: string | null;
  away_placeholder: string | null;
  kickoff_at: string; // ISO timestamp
  venue: string;
  home_score: number | null;
  away_score: number | null;
  status: MatchStatus;
  bracket_slot: number | null;
}

export interface GroupSession {
  id: string;
  name: string;
  invite_code: string;
  creator_player_id: string;
  created_at: string;
}

export interface Player {
  id: string;
  display_name: string;
}

export interface Membership {
  group_id: string;
  player_id: string;
  joined_at: string;
}

export interface LeaderboardRow {
  group_id: string;
  player_id: string;
  total_points: number;
  correct_outcomes: number;
  exact_scores: number;
  correct_bracket: number;
}

export interface MatchPrediction {
  match_id: number;
  predicted_outcome: PredictionOutcome;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
}

export interface BracketPrediction {
  bracket_slot: number;
  predicted_team_id: string;
}

export interface PublicMatchPrediction extends MatchPrediction {
  player_id: string;
  group_id: string;
}

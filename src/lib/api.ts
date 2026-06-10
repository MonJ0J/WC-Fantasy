import { supabase } from "./supabase";
import type {
  GroupSession,
  LeaderboardRow,
  Match,
  MatchPrediction,
  MatchStatus,
  OutrightBetType,
  OutrightPrediction,
  Player,
  PredictionOutcome,
  PublicMatchPrediction,
  Team,
} from "./types";

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ---------- Identity ----------

export async function createPlayer(displayName: string): Promise<string> {
  return rpc<string>("create_player", { p_display_name: displayName });
}

export async function renamePlayer(playerId: string, newName: string): Promise<void> {
  await rpc<void>("rename_player", { p_player_id: playerId, p_new_name: newName });
}

// ---------- Groups ----------

export async function createGroup(
  playerId: string,
  groupName: string,
): Promise<{ id: string; invite_code: string }> {
  const data = await rpc<Array<{ id: string; invite_code: string }>>("create_group", {
    p_player_id: playerId,
    p_group_name: groupName,
  });
  return data[0];
}

export async function joinGroup(playerId: string, inviteCode: string): Promise<string> {
  return rpc<string>("join_group", {
    p_player_id: playerId,
    p_invite_code: inviteCode.trim().toUpperCase(),
  });
}

export async function getGroupByCode(code: string): Promise<GroupSession | null> {
  const { data, error } = await supabase
    .from("groups_sessions")
    .select("*")
    .eq("invite_code", code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as GroupSession | null;
}

export async function getMyGroups(playerId: string): Promise<GroupSession[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("groups_sessions(*)")
    .eq("player_id", playerId);
  if (error) throw new Error(error.message);
  // Supabase types the FK relation as an array, but with a unique target it is
  // effectively a single row. Cast through unknown to flatten.
  return ((data ?? []) as unknown as Array<{ groups_sessions: GroupSession | null }>)
    .map((r) => r.groups_sessions)
    .filter((g): g is GroupSession => g != null);
}

export async function getGroupMembers(groupId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("players(id, display_name)")
    .eq("group_id", groupId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<{ players: Player | null }>)
    .map((r) => r.players)
    .filter((p): p is Player => p != null);
}

// ---------- Teams & matches ----------

export async function getAllTeams(): Promise<Team[]> {
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("group_letter", { ascending: true })
    .order("seed_position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Team[];
}

export async function getAllMatches(): Promise<Match[]> {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("kickoff_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Match[];
}

// ---------- Predictions ----------

export async function getMyMatchPredictions(
  playerId: string,
  groupId: string,
): Promise<MatchPrediction[]> {
  return rpc<MatchPrediction[]>("get_my_predictions", {
    p_player_id: playerId,
    p_group_id: groupId,
  });
}

export async function getMyOutrights(
  playerId: string,
  groupId: string,
): Promise<OutrightPrediction[]> {
  return rpc<OutrightPrediction[]>("get_my_outrights", {
    p_player_id: playerId,
    p_group_id: groupId,
  });
}

export async function submitMatchPrediction(args: {
  playerId: string;
  groupId: string;
  matchId: number;
  outcome: PredictionOutcome;
  homeScore?: number | null;
  awayScore?: number | null;
}): Promise<void> {
  await rpc<void>("submit_match_prediction", {
    p_player_id: args.playerId,
    p_group_id: args.groupId,
    p_match_id: args.matchId,
    p_outcome: args.outcome,
    p_home_score: args.homeScore ?? null,
    p_away_score: args.awayScore ?? null,
  });
}

export async function submitOutrightPrediction(args: {
  playerId: string;
  groupId: string;
  betType: OutrightBetType;
  teamId: string;
  betSubkey?: string | null;
}): Promise<void> {
  await rpc<void>("submit_outright_prediction", {
    p_player_id: args.playerId,
    p_group_id: args.groupId,
    p_bet_type: args.betType,
    p_team_id: args.teamId,
    p_bet_subkey: args.betSubkey ?? null,
  });
}

export async function deleteOutrightPrediction(args: {
  playerId: string;
  groupId: string;
  betType: OutrightBetType;
  betSubkey?: string | null;
}): Promise<void> {
  await rpc<void>("delete_outright_prediction", {
    p_player_id: args.playerId,
    p_group_id: args.groupId,
    p_bet_type: args.betType,
    p_bet_subkey: args.betSubkey ?? null,
  });
}

export async function getPublicPredictions(groupId: string): Promise<PublicMatchPrediction[]> {
  const { data, error } = await supabase
    .from("match_predictions_public")
    .select("*")
    .eq("group_id", groupId);
  if (error) throw new Error(error.message);
  return (data ?? []) as PublicMatchPrediction[];
}

// ---------- Leaderboard ----------

export async function getLeaderboard(groupId: string): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase
    .from("leaderboard_cache")
    .select("*")
    .eq("group_id", groupId);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeaderboardRow[];
}

// ---------- Admin ----------

export async function setMatchResult(args: {
  adminKey: string;
  matchId: number;
  homeScore: number;
  awayScore: number;
  status?: MatchStatus;
}): Promise<void> {
  await rpc<void>("set_match_result", {
    p_admin_key: args.adminKey,
    p_match_id: args.matchId,
    p_home_score: args.homeScore,
    p_away_score: args.awayScore,
    p_status: args.status ?? "FINISHED",
  });
}

export async function setMatchTeams(args: {
  adminKey: string;
  matchId: number;
  homeTeam: string;
  awayTeam: string;
}): Promise<void> {
  await rpc<void>("set_match_teams", {
    p_admin_key: args.adminKey,
    p_match_id: args.matchId,
    p_home_team: args.homeTeam,
    p_away_team: args.awayTeam,
  });
}

import { supabase } from "./supabase";
import type {
  AwardPrediction,
  AwardType,
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
  TournamentPlayer,
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

export interface AuthedIdentity {
  player_id: string;
  display_name: string;
}

export async function signUp(args: {
  username: string;
  password: string;
  displayName: string;
}): Promise<AuthedIdentity> {
  const data = await rpc<AuthedIdentity[]>("sign_up", {
    p_username: args.username,
    p_password: args.password,
    p_display_name: args.displayName,
  });
  return data[0];
}

export async function signIn(args: {
  username: string;
  password: string;
}): Promise<AuthedIdentity> {
  const data = await rpc<AuthedIdentity[]>("sign_in", {
    p_username: args.username,
    p_password: args.password,
  });
  return data[0];
}

export async function attachCredentials(args: {
  playerId: string;
  username: string;
  password: string;
}): Promise<void> {
  await rpc<void>("attach_credentials", {
    p_player_id: args.playerId,
    p_username: args.username,
    p_password: args.password,
  });
}

export interface DashboardGroup {
  group_id: string;
  group_name: string;
  invite_code: string;
  is_creator: boolean;
  joined_at: string;
  member_count: number;
  total_points: number;
  my_rank: number;
}

export async function getMyDashboard(playerId: string): Promise<DashboardGroup[]> {
  return rpc<DashboardGroup[]>("get_my_dashboard", { p_player_id: playerId });
}

export interface ImportResult {
  matches_copied: number;
  outrights_copied: number;
}

export async function importPredictionsFromGroup(args: {
  playerId: string;
  sourceGroupId: string;
  destGroupId: string;
}): Promise<ImportResult> {
  const data = await rpc<ImportResult[]>("import_predictions_from_group", {
    p_player_id: args.playerId,
    p_source_group_id: args.sourceGroupId,
    p_dest_group_id: args.destGroupId,
  });
  return data[0];
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

// ---------- Award predictions (Top Scorer / Top Player / Top Nation) ----------

export async function getTournamentPlayers(): Promise<TournamentPlayer[]> {
  const { data, error } = await supabase
    .from("tournament_players")
    .select("id, name, team_id")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as TournamentPlayer[];
}

export async function getMyAwards(
  playerId: string,
  groupId: string,
): Promise<AwardPrediction[]> {
  return rpc<AwardPrediction[]>("get_my_awards", {
    p_player_id: playerId,
    p_group_id: groupId,
  });
}

export async function submitAwardPrediction(args: {
  playerId: string;
  groupId: string;
  awardType: AwardType;
  playerName: string;
}): Promise<void> {
  await rpc<void>("submit_award_prediction", {
    p_player_id: args.playerId,
    p_group_id: args.groupId,
    p_award_type: args.awardType,
    p_player_name: args.playerName,
  });
}

export async function deleteAwardPrediction(args: {
  playerId: string;
  groupId: string;
  awardType: AwardType;
}): Promise<void> {
  await rpc<void>("delete_award_prediction", {
    p_player_id: args.playerId,
    p_group_id: args.groupId,
    p_award_type: args.awardType,
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

export async function setAwardResult(args: {
  adminKey: string;
  awardType: AwardType;
  winner: string;
}): Promise<void> {
  await rpc<void>("set_award_result", {
    p_admin_key: args.adminKey,
    p_award_type: args.awardType,
    p_winner: args.winner,
  });
}

// ---------- Sync log ----------

export interface SyncLogRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  source: string;
  matches_seen: number;
  matches_updated: number;
  teams_resolved: number;
  finalized_count: number;
  status: "RUNNING" | "OK" | "ERROR";
  error_message: string | null;
}

export async function getLastSync(): Promise<SyncLogRow | null> {
  const { data, error } = await supabase
    .from("sync_log")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SyncLogRow | null) ?? null;
}

// ---------- App settings ----------

/**
 * Returns the outrights lock deadline. Uses the app_settings override if
 * present; otherwise falls back to match #1's kickoff time.
 */
export async function getOutrightsLockAt(): Promise<string | null> {
  return rpc<string | null>("get_outrights_lock_at", {});
}

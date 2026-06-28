// Supabase Edge Function: sync-wc-matches
//
// Pulls the 2026 FIFA World Cup schedule + scores from football-data.org
// and upserts into our `matches` table via the security-definer RPCs.
//
// Triggers:
//   * Manually (POST any body):
//     curl -X POST -H "Authorization: Bearer SUPABASE_ANON_KEY" \
//          https://YOUR-REF.supabase.co/functions/v1/sync-wc-matches
//   * pg_cron schedule (see supabase/migrations/0003_sync_infra.sql).
//
// Env vars (set via `supabase secrets set ...`):
//   FOOTBALL_DATA_API_KEY  Your football-data.org X-Auth-Token.
//   ADMIN_KEY              Same value as app_settings.admin_key. Used to
//                          call the security-definer RPCs.
//   SUPABASE_URL           (auto-set by Supabase)
//   SUPABASE_ANON_KEY      (auto-set by Supabase)
//
// Deploy:
//   supabase functions deploy sync-wc-matches --no-verify-jwt
//   supabase secrets set FOOTBALL_DATA_API_KEY=...
//   supabase secrets set ADMIN_KEY=...
//
// --no-verify-jwt lets pg_cron call it without an Authorization header;
// security is enforced by the ADMIN_KEY check inside the RPCs.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const STAGE_MAP: Record<string, string> = {
  GROUP_STAGE: "GROUP",
  LAST_32: "R32",
  LAST_16: "R16",
  QUARTER_FINALS: "QF",
  SEMI_FINALS: "SF",
  THIRD_PLACE: "THIRD",
  FINAL: "FINAL",
};

const STATUS_MAP: Record<string, string> = {
  SCHEDULED: "SCHEDULED",
  TIMED: "SCHEDULED",
  POSTPONED: "SCHEDULED",
  CANCELLED: "SCHEDULED",
  IN_PLAY: "LIVE",
  PAUSED: "LIVE",
  SUSPENDED: "LIVE",
  FINISHED: "FINISHED",
  AWARDED: "FINISHED",
};

// football-data.org returns URY for Uruguay; our seed uses URU.
const TLA_ALIASES: Record<string, string> = {
  URY: "URU",
};

function ourTla(tla: string | null | undefined): string | null {
  if (!tla) return null;
  return TLA_ALIASES[tla] ?? tla;
}

interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  stage: string;
  group: string | null;
  homeTeam: { id: number | null; name: string | null; tla: string | null };
  awayTeam: { id: number | null; name: string | null; tla: string | null };
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration: string;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
}

Deno.serve(async (req: Request) => {
  const apiKey = Deno.env.get("FOOTBALL_DATA_API_KEY");
  const adminKey = Deno.env.get("ADMIN_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!apiKey || !adminKey || !supabaseUrl || !supabaseAnonKey) {
    return json(500, {
      error: "Missing env: need FOOTBALL_DATA_API_KEY, ADMIN_KEY, SUPABASE_URL, SUPABASE_ANON_KEY",
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });

  // Start a sync_log row to track this run.
  let logId: string | null = null;
  let matchesSeen = 0;
  let matchesUpdated = 0;
  let teamsResolved = 0;
  let finalizedCount = 0;

  try {
    const { data: startId, error: startErr } = await supabase.rpc("start_sync_run", {
      p_admin_key: adminKey,
    });
    if (startErr) throw new Error(`start_sync_run: ${startErr.message}`);
    logId = startId as string;

    // Pull every match from football-data.org.
    const fdRes = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!fdRes.ok) {
      throw new Error(`football-data.org ${fdRes.status}: ${await fdRes.text()}`);
    }
    const fdBody = await fdRes.json();
    const fdMatches: FdMatch[] = fdBody.matches ?? [];
    matchesSeen = fdMatches.length;

    for (const m of fdMatches) {
      const stage = STAGE_MAP[m.stage];
      const status = STATUS_MAP[m.status];
      if (!stage || !status) continue;

      const homeTla = ourTla(m.homeTeam?.tla ?? null);
      const awayTla = ourTla(m.awayTeam?.tla ?? null);
      if (homeTla && awayTla) teamsResolved++;

      // Score: regulation full-time. PK winner captured via winner_team_id.
      const homeScore = m.score?.fullTime?.home ?? null;
      const awayScore = m.score?.fullTime?.away ?? null;

      let winnerTeamId: string | null = null;
      if (stage !== "GROUP" && m.score?.winner) {
        if (m.score.winner === "HOME_TEAM") winnerTeamId = homeTla;
        else if (m.score.winner === "AWAY_TEAM") winnerTeamId = awayTla;
      }

      // football-data.org sets `score.duration` to "PENALTY_SHOOTOUT" when
      // a KO match was decided on PKs. We mirror that into matches.went_to_penalties
      // so the leaderboard can award the "called PKs" bonus.
      const wentToPenalties =
        stage !== "GROUP" && status === "FINISHED"
          ? m.score?.duration === "PENALTY_SHOOTOUT"
          : null;

      // Resolve our fifa_id (1..104).
      const { data: ourId, error: resolveErr } = await supabase.rpc("resolve_match_id", {
        p_external_id: m.id,
        p_stage: stage,
        p_utc_date: m.utcDate,
        p_home_tla: homeTla,
        p_away_tla: awayTla,
      });
      if (resolveErr) {
        console.error("resolve_match_id:", resolveErr.message);
        continue;
      }
      if (ourId == null) {
        console.warn(`no match for fd#${m.id} ${stage} ${m.utcDate} ${homeTla} v ${awayTla}`);
        continue;
      }

      const { data: upsertRows, error: upsertErr } = await supabase.rpc("upsert_match_from_sync", {
        p_admin_key: adminKey,
        p_match_id: ourId,
        p_external_id: m.id,
        p_home_team_id: homeTla,
        p_away_team_id: awayTla,
        p_home_score: homeScore,
        p_away_score: awayScore,
        p_winner_team_id: winnerTeamId,
        p_status: status,
        p_kickoff_at: m.utcDate,
        p_went_to_penalties: wentToPenalties,
      });
      if (upsertErr) {
        console.error(`upsert ${ourId}:`, upsertErr.message);
        continue;
      }
      const row = Array.isArray(upsertRows) ? upsertRows[0] : upsertRows;
      if (row?.changed) matchesUpdated++;
      if (row?.finalized) finalizedCount++;
    }

    // Recompute leaderboards if anything finished.
    if (finalizedCount > 0) {
      const { error: recalcErr } = await supabase.rpc("recalc_scores", { p_group_id: null });
      if (recalcErr) console.error("recalc_scores:", recalcErr.message);
    }

    await supabase.rpc("log_sync_run", {
      p_admin_key: adminKey,
      p_log_id: logId,
      p_matches_seen: matchesSeen,
      p_matches_updated: matchesUpdated,
      p_teams_resolved: teamsResolved,
      p_finalized_count: finalizedCount,
      p_status: "OK",
      p_error_message: null,
    });

    return json(200, {
      ok: true,
      matchesSeen,
      matchesUpdated,
      teamsResolved,
      finalizedCount,
      recalculated: finalizedCount > 0,
    });
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("sync error:", msg);
    if (logId) {
      await supabase.rpc("log_sync_run", {
        p_admin_key: adminKey,
        p_log_id: logId,
        p_matches_seen: matchesSeen,
        p_matches_updated: matchesUpdated,
        p_teams_resolved: teamsResolved,
        p_finalized_count: finalizedCount,
        p_status: "ERROR",
        p_error_message: msg.slice(0, 500),
      });
    }
    return json(500, { error: msg });
  }
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json" },
  });
}

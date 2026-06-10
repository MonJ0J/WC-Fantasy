import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  getAllMatches,
  getAllTeams,
  getMyBracket,
  submitBracketPrediction,
} from "../lib/api";
import type { BracketPrediction, Match, Team } from "../lib/types";
import { Spinner } from "../components/Primitives";
import { STAGE_LABEL } from "../lib/scoring";
import { formatKickoff } from "../lib/timezone";
import { cx } from "../lib/utils";
import type { GroupContext } from "./GroupLayout";

const ROUND_ORDER: Array<Match["stage"]> = ["R32", "R16", "QF", "SF", "FINAL"];

export function BracketBuilder() {
  const { group, playerId } = useOutletContext<GroupContext>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [picks, setPicks] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [m, t, p] = await Promise.all([
        getAllMatches(),
        getAllTeams(),
        getMyBracket(playerId, group.id).catch(() => [] as BracketPrediction[]),
      ]);
      if (cancelled) return;
      setMatches(m);
      setTeams(t);
      setPicks(new Map(p.map((x) => [x.bracket_slot, x.predicted_team_id])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id, playerId]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const teamsByGroup = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const t of teams) {
      if (!t.group_letter) continue;
      const list = map.get(t.group_letter) ?? [];
      list.push(t);
      map.set(t.group_letter, list);
    }
    return map;
  }, [teams]);

  const koMatches = useMemo(
    () => matches.filter((m) => m.stage !== "GROUP" && m.stage !== "THIRD").sort((a, b) => a.id - b.id),
    [matches],
  );

  const bracketLocked =
    matches.find((m) => m.id === 73) != null &&
    new Date(matches.find((m) => m.id === 73)!.kickoff_at).getTime() <= Date.now();

  function eligibleTeams(m: Match): Team[] {
    if (m.stage === "R32") {
      const codes = new Set<string>();
      for (const ph of [m.home_placeholder, m.away_placeholder]) {
        if (!ph) continue;
        const groups = extractGroupsFromPlaceholder(ph);
        for (const g of groups) {
          for (const t of teamsByGroup.get(g) ?? []) codes.add(t.id);
        }
      }
      return teams.filter((t) => codes.has(t.id));
    }
    // R16+ depends on the two feeder bracket slots.
    const feederIds: number[] = [];
    for (const ph of [m.home_placeholder, m.away_placeholder]) {
      if (!ph) continue;
      const match = /Winner Match (\d+)/i.exec(ph);
      if (match) feederIds.push(Number(match[1]));
    }
    const candidates: Team[] = [];
    for (const fid of feederIds) {
      const pickedId = picks.get(fid);
      if (pickedId) {
        const t = teamById.get(pickedId);
        if (t) candidates.push(t);
      }
    }
    return candidates;
  }

  async function setPick(slot: number, teamId: string) {
    if (bracketLocked) return;
    setSavingSlot(slot);
    setError(null);
    const prev = new Map(picks);
    const next = new Map(picks);
    next.set(slot, teamId);

    // Invalidate downstream picks whose eligibility no longer holds.
    for (const m of koMatches) {
      if (m.stage === "R32") continue;
      const eligible = eligibleTeamsFor(m, next, teamsByGroup, teamById, teams);
      const current = next.get(m.bracket_slot ?? -1);
      if (current && !eligible.some((t) => t.id === current)) {
        next.delete(m.bracket_slot ?? -1);
      }
    }
    setPicks(next);

    try {
      await submitBracketPrediction({
        playerId,
        groupId: group.id,
        bracketSlot: slot,
        teamId,
      });
    } catch (e) {
      setPicks(prev);
      setError(e instanceof Error ? e.message : "Failed to save pick");
    } finally {
      setSavingSlot(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const total = koMatches.length;
  const filled = koMatches.filter((m) => picks.has(m.bracket_slot ?? -1)).length;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">Build your bracket</h2>
          <p className="text-xs text-slate-500">
            {bracketLocked
              ? "Bracket locked — these are your final picks."
              : "Picks autosave. Locks when the first Round of 32 kicks off (June 28)."}
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
          {filled} / {total} picks
        </span>
      </div>

      {error && (
        <div className="card border-red-300 bg-red-50 text-sm text-red-700">{error}</div>
      )}

      {ROUND_ORDER.map((round) => {
        const items = koMatches.filter((m) => m.stage === round);
        if (items.length === 0) return null;
        return (
          <section key={round} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {STAGE_LABEL[round]} · {pointsFor(round)} pts each
              </h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((m) => (
                <SlotPicker
                  key={m.id}
                  match={m}
                  eligible={eligibleTeams(m)}
                  currentPick={picks.get(m.bracket_slot ?? -1) ?? null}
                  disabled={bracketLocked || savingSlot === m.bracket_slot}
                  onChange={(teamId) => void setPick(m.bracket_slot ?? m.id, teamId)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function SlotPicker({
  match,
  eligible,
  currentPick,
  disabled,
  onChange,
}: {
  match: Match;
  eligible: Team[];
  currentPick: string | null;
  disabled: boolean;
  onChange: (teamId: string) => void;
}) {
  return (
    <article className="card !p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500">
        <span>#{match.id} · {STAGE_LABEL[match.stage]}</span>
        <span>{formatKickoff(match.kickoff_at)}</span>
      </div>
      <div className="mt-1 text-xs text-slate-600">
        <span className="line-clamp-1">{match.home_placeholder}</span>
        <span className="text-slate-400"> vs </span>
        <span className="line-clamp-1">{match.away_placeholder}</span>
      </div>
      <div className="mt-2">
        {eligible.length === 0 ? (
          <p className="text-xs italic text-slate-400">
            Make your picks for the prior round first.
          </p>
        ) : (
          <select
            disabled={disabled}
            value={currentPick ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={cx(
              "input !py-2 !text-sm",
              currentPick && "border-brand-400 bg-brand-50",
            )}
          >
            <option value="">— pick an advancing team —</option>
            {eligible.map((t) => (
              <option key={t.id} value={t.id}>
                {t.flag_emoji} {t.name}
                {t.group_letter ? ` (Group ${t.group_letter})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
    </article>
  );
}

function pointsFor(stage: Match["stage"]): number {
  switch (stage) {
    case "R32":
      return 5;
    case "R16":
      return 10;
    case "QF":
      return 15;
    case "SF":
      return 20;
    case "FINAL":
      return 25;
    default:
      return 0;
  }
}

function extractGroupsFromPlaceholder(ph: string): string[] {
  // "Winner Group A", "Runner-up Group C", "3rd Group A/B/C/D/F", "3rd Group ABCDF"
  const single = /Group ([A-L])\b/.exec(ph);
  if (single) return [single[1]];
  const list = /Group ([A-L/]+)\b/.exec(ph);
  if (list) return list[1].split("/").filter((s) => /^[A-L]$/.test(s));
  const compact = /Group ([A-L]+)\b/.exec(ph);
  if (compact) return compact[1].split("");
  return [];
}

function eligibleTeamsFor(
  m: Match,
  picks: Map<number, string>,
  teamsByGroup: Map<string, Team[]>,
  teamById: Map<string, Team>,
  allTeams: Team[],
): Team[] {
  if (m.stage === "R32") {
    const codes = new Set<string>();
    for (const ph of [m.home_placeholder, m.away_placeholder]) {
      if (!ph) continue;
      for (const g of extractGroupsFromPlaceholder(ph)) {
        for (const t of teamsByGroup.get(g) ?? []) codes.add(t.id);
      }
    }
    return allTeams.filter((t) => codes.has(t.id));
  }
  const feederIds: number[] = [];
  for (const ph of [m.home_placeholder, m.away_placeholder]) {
    if (!ph) continue;
    const match = /Winner Match (\d+)/i.exec(ph);
    if (match) feederIds.push(Number(match[1]));
  }
  const out: Team[] = [];
  for (const fid of feederIds) {
    const pickedId = picks.get(fid);
    if (pickedId) {
      const t = teamById.get(pickedId);
      if (t) out.push(t);
    }
  }
  return out;
}

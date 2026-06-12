import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  deleteAwardPrediction,
  deleteOutrightPrediction,
  getAllTeams,
  getMyAwards,
  getMyOutrights,
  getOutrightsLockAt,
  getTournamentPlayers,
  submitAwardPrediction,
  submitOutrightPrediction,
} from "../lib/api";
import type {
  AwardPrediction,
  AwardType,
  OutrightBetType,
  OutrightPrediction,
  Team,
  TournamentPlayer,
} from "../lib/types";
import { OUTRIGHT_POINTS } from "../lib/scoring";
import { formatKickoff, formatPlayerAwardLock, isPlayerAwardLocked, isStarted } from "../lib/timezone";
import { Spinner } from "../components/Primitives";
import { cx } from "../lib/utils";
import type { GroupContext } from "./GroupLayout";

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"] as const;
const SEMI_SLOTS = ["1", "2", "3", "4"] as const;

export function Outrights() {
  const { group, playerId } = useOutletContext<GroupContext>();
  const [teams, setTeams] = useState<Team[]>([]);
  const [picks, setPicks] = useState<OutrightPrediction[]>([]);
  const [candidates, setCandidates] = useState<TournamentPlayer[]>([]);
  const [awards, setAwards] = useState<AwardPrediction[]>([]);
  const [lockAt, setLockAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [t, lock, mine, cands, myAwards] = await Promise.all([
        getAllTeams(),
        getOutrightsLockAt().catch(() => null),
        getMyOutrights(playerId, group.id).catch(() => [] as OutrightPrediction[]),
        getTournamentPlayers().catch(() => [] as TournamentPlayer[]),
        getMyAwards(playerId, group.id).catch(() => [] as AwardPrediction[]),
      ]);
      if (cancelled) return;
      setTeams(t);
      setLockAt(lock);
      setPicks(mine);
      setCandidates(cands);
      setAwards(myAwards);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id, playerId]);

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
  const pot12 = useMemo(
    () => teams.filter((t) => t.seed_position === 1 || t.seed_position === 2),
    [teams],
  );

  const locked = lockAt ? isStarted(lockAt) : false;
  const playerAwardLocked = isPlayerAwardLocked();

  function pickKey(betType: OutrightBetType, subkey: string | null): string {
    return `${betType}:${subkey ?? ""}`;
  }

  function getPick(betType: OutrightBetType, subkey: string | null): string {
    return (
      picks.find(
        (p) => p.bet_type === betType && (p.bet_subkey ?? "") === (subkey ?? ""),
      )?.predicted_team_id ?? ""
    );
  }

  async function save(
    betType: OutrightBetType,
    teamId: string,
    subkey: string | null = null,
  ) {
    const key = pickKey(betType, subkey);
    setSavingKey(key);
    setError(null);

    // Optimistic update.
    const prev = picks;
    const next = picks.filter(
      (p) => !(p.bet_type === betType && (p.bet_subkey ?? "") === (subkey ?? "")),
    );
    if (teamId) next.push({ bet_type: betType, bet_subkey: subkey, predicted_team_id: teamId });
    setPicks(next);

    try {
      if (teamId === "") {
        await deleteOutrightPrediction({
          playerId,
          groupId: group.id,
          betType,
          betSubkey: subkey,
        });
      } else {
        await submitOutrightPrediction({
          playerId,
          groupId: group.id,
          betType,
          teamId,
          betSubkey: subkey,
        });
      }
    } catch (e) {
      setPicks(prev);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingKey(null);
    }
  }

  function getAward(awardType: AwardType): AwardPrediction | undefined {
    return awards.find((a) => a.award_type === awardType);
  }

  async function saveAward(
    awardType: AwardType,
    value: { playerName?: string | null; teamId?: string | null },
  ) {
    const key = `AWARD:${awardType}`;
    const isNation = awardType === "TOP_NATION";
    const trimmed = (value.playerName ?? "").trim();
    const cleared = isNation ? !value.teamId : trimmed === "";

    setSavingKey(key);
    setError(null);

    // Optimistic update.
    const prev = awards;
    const next = awards.filter((a) => a.award_type !== awardType);
    if (!cleared) {
      next.push({
        award_type: awardType,
        predicted_player_name: isNation ? null : trimmed,
        predicted_team_id: isNation ? (value.teamId ?? null) : null,
      });
    }
    setAwards(next);

    try {
      if (cleared) {
        await deleteAwardPrediction({ playerId, groupId: group.id, awardType });
      } else {
        await submitAwardPrediction({
          playerId,
          groupId: group.id,
          awardType,
          playerName: isNation ? null : trimmed,
          teamId: isNation ? value.teamId : null,
        });
      }
    } catch (e) {
      setAwards(prev);
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  const totalMax =
    OUTRIGHT_POINTS.CHAMPION +
    OUTRIGHT_POINTS.RUNNER_UP +
    OUTRIGHT_POINTS.GROUP_WINNER * 12 +
    OUTRIGHT_POINTS.SEMIFINALIST * 4 +
    OUTRIGHT_POINTS.UNDERPERFORMER;

  return (
    <div className="space-y-5">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Outright bets</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Big-call picks worth up to <strong>{totalMax} pts</strong>. Lock together at first
            kickoff ({lockAt ? formatKickoff(lockAt) : "TBD"}).
          </p>
        </div>
        {locked && <span className="pill-locked">🔒 Locked</span>}
      </div>

      {error && <div className="card border-red-300 bg-red-50 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      <Section
        title="🏆 Champion"
        subtitle={`+${OUTRIGHT_POINTS.CHAMPION} pts · pick the World Cup winner.`}
      >
        <TeamPicker
          value={getPick("CHAMPION", null)}
          onChange={(v) => void save("CHAMPION", v)}
          teams={teams}
          disabled={locked || savingKey === pickKey("CHAMPION", null)}
        />
      </Section>

      <Section
        title="🥈 Runner-up"
        subtitle={`+${OUTRIGHT_POINTS.RUNNER_UP} pts · pick the team that loses the final.`}
      >
        <TeamPicker
          value={getPick("RUNNER_UP", null)}
          onChange={(v) => void save("RUNNER_UP", v)}
          teams={teams}
          disabled={locked || savingKey === pickKey("RUNNER_UP", null)}
        />
      </Section>

      <Section
        title="🎯 Group Winners"
        subtitle={`+${OUTRIGHT_POINTS.GROUP_WINNER} pts each · pick who tops each of the 12 groups.`}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {GROUP_LETTERS.map((letter) => (
            <div key={letter} className="flex items-center gap-2">
              <span className="w-16 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Group {letter}
              </span>
              <TeamPicker
                value={getPick("GROUP_WINNER", letter)}
                onChange={(v) => void save("GROUP_WINNER", v, letter)}
                teams={teamsByGroup.get(letter) ?? []}
                disabled={locked || savingKey === pickKey("GROUP_WINNER", letter)}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="⚔️ Semifinalists"
        subtitle={`+${OUTRIGHT_POINTS.SEMIFINALIST} pts each · pick 4 teams that reach the semifinals. Partial credit.`}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {SEMI_SLOTS.map((slot) => {
            // Exclude already-picked teams from other slots.
            const otherPicks = new Set(
              picks
                .filter((p) => p.bet_type === "SEMIFINALIST" && p.bet_subkey !== slot)
                .map((p) => p.predicted_team_id),
            );
            return (
              <div key={slot} className="flex items-center gap-2">
                <span className="w-16 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Slot {slot}
                </span>
                <TeamPicker
                  value={getPick("SEMIFINALIST", slot)}
                  onChange={(v) => void save("SEMIFINALIST", v, slot)}
                  teams={teams.filter((t) => !otherPicks.has(t.id))}
                  disabled={locked || savingKey === pickKey("SEMIFINALIST", slot)}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section
        title="💥 Underperformer"
        subtitle={`+${OUTRIGHT_POINTS.UNDERPERFORMER} pts · pick a top-seed team (Pot 1 or 2) you think won't make it past the group stage.`}
      >
        <TeamPicker
          value={getPick("UNDERPERFORMER", null)}
          onChange={(v) => void save("UNDERPERFORMER", v)}
          teams={pot12}
          disabled={locked || savingKey === pickKey("UNDERPERFORMER", null)}
        />
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Pot 1 = pre-draw seed 1 of each group · Pot 2 = seed 2. {pot12.length} teams eligible.
        </p>
      </Section>

      <div className="card border-dashed bg-slate-50/50">
        <h3 className="text-sm font-semibold">🎖️ Tournament awards</h3>
        <p className="text-xs text-slate-500">
          Call the individual awards. They don't score points yet, but will count later. The Top
          Goal Scorer and Top Player picks lock on <strong>{formatPlayerAwardLock()}</strong>; Top
          Nation locks at first kickoff.
        </p>
      </div>

      <Section
        title="👟 Top Goal Scorer"
        subtitle={`Pick the tournament's leading scorer (Golden Boot). Choose a favourite or type any name.${
          playerAwardLocked ? " 🔒 Locked." : ""
        }`}
      >
        <PlayerPicker
          value={getAward("TOP_SCORER")?.predicted_player_name ?? ""}
          onCommit={(v) => void saveAward("TOP_SCORER", { playerName: v })}
          candidates={candidates}
          disabled={playerAwardLocked}
          saving={savingKey === "AWARD:TOP_SCORER"}
        />
      </Section>

      <Section
        title="⭐ Top Player"
        subtitle={`Pick the best player of the tournament (Golden Ball). Choose a favourite or type any name.${
          playerAwardLocked ? " 🔒 Locked." : ""
        }`}
      >
        <PlayerPicker
          value={getAward("TOP_PLAYER")?.predicted_player_name ?? ""}
          onCommit={(v) => void saveAward("TOP_PLAYER", { playerName: v })}
          candidates={candidates}
          disabled={playerAwardLocked}
          saving={savingKey === "AWARD:TOP_PLAYER"}
        />
      </Section>

      <Section
        title="🌍 Top Nation"
        subtitle="Pick the nation you think will be the standout team of the tournament."
      >
        <TeamPicker
          value={getAward("TOP_NATION")?.predicted_team_id ?? ""}
          onChange={(v) => void saveAward("TOP_NATION", { teamId: v })}
          teams={teams}
          disabled={locked || savingKey === "AWARD:TOP_NATION"}
        />
      </Section>

      {locked && (
        <p className="pt-4 text-center text-xs text-slate-500 dark:text-slate-400">
          Outrights are locked. Results score automatically as the tournament unfolds.
        </p>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-3">
      <header>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

function TeamPicker({
  value,
  onChange,
  teams,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  teams: Team[];
  disabled: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cx("input !py-2 !text-sm", value && "border-brand-400 bg-brand-50 dark:bg-brand-500/15")}
    >
      <option value="">— pick a team —</option>
      {teams
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((t) => (
          <option key={t.id} value={t.id}>
            {t.flag_emoji} {t.name}
            {t.group_letter ? ` (${t.group_letter})` : ""}
          </option>
        ))}
    </select>
  );
}

function PlayerPicker({
  value,
  onCommit,
  candidates,
  disabled,
  saving,
}: {
  value: string;
  onCommit: (v: string) => void;
  candidates: TournamentPlayer[];
  disabled: boolean;
  saving: boolean;
}) {
  const listId = useMemo(() => `players-${Math.random().toString(36).slice(2)}`, []);
  const [draft, setDraft] = useState(value);

  // Keep the field in sync when the saved value changes (e.g. after load).
  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed !== value.trim()) onCommit(trimmed);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        list={listId}
        value={draft}
        placeholder="Type or pick a player…"
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={cx("input !py-2 !text-sm", draft && "border-brand-400 bg-brand-50")}
      />
      <datalist id={listId}>
        {candidates.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      {saving && <Spinner className="h-4 w-4 shrink-0 text-brand-600" />}
    </div>
  );
}

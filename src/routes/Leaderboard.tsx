import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getGroupMembers, getLeaderboard } from "../lib/api";
import type { LeaderboardRow, Player } from "../lib/types";
import { EmptyState, Spinner } from "../components/Primitives";
import { cx } from "../lib/utils";
import type { GroupContext } from "./GroupLayout";

export function Leaderboard() {
  const { group, playerId } = useOutletContext<GroupContext>();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [members, setMembers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [lb, m] = await Promise.all([getLeaderboard(group.id), getGroupMembers(group.id)]);
      if (cancelled) return;
      setRows(lb);
      setMembers(m);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  const nameById = useMemo(() => new Map(members.map((m) => [m.id, m.display_name])), [members]);

  const sorted = useMemo(() => {
    // Ensure every member appears (server seeds them, but be defensive).
    const lbById = new Map(rows.map((r) => [r.player_id, r]));
    const augmented: LeaderboardRow[] = members.map(
      (m) =>
        lbById.get(m.id) ?? {
          group_id: group.id,
          player_id: m.id,
          total_points: 0,
          correct_outcomes: 0,
          exact_scores: 0,
          correct_bracket: 0,
        },
    );
    return augmented.sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points;
      if (b.exact_scores !== a.exact_scores) return b.exact_scores - a.exact_scores;
      if (b.correct_outcomes !== a.correct_outcomes) return b.correct_outcomes - a.correct_outcomes;
      return (nameById.get(a.player_id) ?? "").localeCompare(nameById.get(b.player_id) ?? "");
    });
  }, [rows, members, nameById, group.id]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="No players yet"
        description="Share your invite code to start competing."
      />
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">#</th>
            <th className="px-4 py-3">Player</th>
            <th className="px-2 py-3 text-right">Pts</th>
            <th className="px-2 py-3 text-right">Outcomes</th>
            <th className="px-2 py-3 text-right">Exact</th>
            <th className="px-2 py-3 text-right">Bracket</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const isMe = r.player_id === playerId;
            return (
              <tr
                key={r.player_id}
                className={cx(
                  "border-t border-slate-100",
                  isMe ? "bg-brand-50 font-semibold" : "hover:bg-slate-50",
                )}
              >
                <td className="px-4 py-3 text-slate-500">{i + 1}</td>
                <td className="px-4 py-3">
                  {nameById.get(r.player_id) ?? "—"}
                  {isMe && <span className="ml-1 text-xs text-brand-600">(you)</span>}
                </td>
                <td className="px-2 py-3 text-right tabular-nums font-bold">{r.total_points}</td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-600">
                  {r.correct_outcomes}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-600">
                  {r.exact_scores}
                </td>
                <td className="px-2 py-3 text-right tabular-nums text-slate-600">
                  {r.correct_bracket}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { getGroupMembers } from "../lib/api";
import type { Player } from "../lib/types";
import { Spinner } from "../components/Primitives";
import type { GroupContext } from "./GroupLayout";

export function Members() {
  const { group, playerId } = useOutletContext<GroupContext>();
  const [members, setMembers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const m = await getGroupMembers(group.id);
      if (!cancelled) {
        setMembers(m);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [group.id]);

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-sm font-semibold text-slate-700">Invite friends</h2>
        <p className="mt-1 text-sm text-slate-600">
          Share this code or link — anyone who has it can join.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 font-mono text-lg font-bold tracking-widest">
          {group.invite_code}
        </div>
        <div className="mt-2 break-all text-xs text-slate-500">
          {window.location.origin}/join?code={group.invite_code}
        </div>
      </div>

      <div className="card p-0">
        <h2 className="px-4 py-3 text-sm font-semibold text-slate-700">
          Members ({members.length})
        </h2>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span className="font-medium">
                {m.display_name}
                {m.id === playerId && (
                  <span className="ml-1 text-xs font-normal text-brand-600">(you)</span>
                )}
              </span>
              {m.id === group.creator_player_id && (
                <span className="pill bg-emerald-100 text-emerald-800">creator</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

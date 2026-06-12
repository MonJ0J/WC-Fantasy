import { useEffect, useState } from "react";
import {
  getMyDashboard,
  importPredictionsFromGroup,
  type DashboardGroup,
} from "../lib/api";
import { Spinner } from "./Primitives";
import { cx } from "../lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  playerId: string;
  /** Group we're importing INTO (we'll exclude it from the dropdown). */
  destGroupId: string;
  destGroupName: string;
  onComplete: (result: { matches: number; outrights: number }) => void;
}

/**
 * Copies the player's match + outright predictions from a chosen group into
 * the current one. Handy when someone made all their picks in the wrong
 * pool and joined the right one later.
 */
export function ImportPicksModal({
  open,
  onClose,
  playerId,
  destGroupId,
  destGroupName,
  onComplete,
}: Props) {
  const [groups, setGroups] = useState<DashboardGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const all = await getMyDashboard(playerId);
        if (cancelled) return;
        setGroups(all.filter((g) => g.group_id !== destGroupId));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load groups");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, playerId, destGroupId]);

  async function runImport() {
    if (!selectedId) return;
    const source = groups?.find((g) => g.group_id === selectedId);
    if (!source) return;
    if (
      !window.confirm(
        `Copy your picks from "${source.group_name}" into "${destGroupName}"? Any existing picks in "${destGroupName}" will be overwritten.`,
      )
    ) {
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const result = await importPredictionsFromGroup({
        playerId,
        sourceGroupId: selectedId,
        destGroupId,
      });
      onComplete({ matches: result.matches_copied, outrights: result.outrights_copied });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">📥 Import picks</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Copy your match + outright picks from another group into{" "}
                <strong>{destGroupName}</strong>.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-xl leading-none text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="h-6 w-6 text-brand-600" />
            </div>
          ) : !groups || groups.length === 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              You're not in any other groups to import from.
            </p>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Choose source group
              </p>
              <div className="space-y-2">
                {groups.map((g) => (
                  <label
                    key={g.group_id}
                    className={cx(
                      "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-2 transition",
                      selectedId === g.group_id
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30"
                        : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
                    )}
                  >
                    <div>
                      <div className="text-sm font-semibold">{g.group_name}</div>
                      <div className="text-[11px] text-slate-500">
                        {g.member_count} member{g.member_count === 1 ? "" : "s"} ·{" "}
                        <span className="font-mono">{g.invite_code}</span>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="source-group"
                      value={g.group_id}
                      checked={selectedId === g.group_id}
                      onChange={() => setSelectedId(g.group_id)}
                      className="h-4 w-4 accent-brand-600"
                    />
                  </label>
                ))}
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <button onClick={onClose} disabled={importing} className="btn-ghost !py-1.5 text-xs">
            Cancel
          </button>
          <button
            onClick={() => void runImport()}
            disabled={!selectedId || importing}
            className="btn-primary !py-1.5 text-xs"
          >
            {importing ? <Spinner className="h-4 w-4" /> : "Import picks"}
          </button>
        </footer>
      </div>
    </div>
  );
}

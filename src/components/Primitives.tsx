import type { ReactNode } from "react";
import { cx } from "../lib/utils";

interface StatusPillProps {
  status: "scheduled" | "locked" | "live" | "finished";
  children: ReactNode;
}

export function StatusPill({ status, children }: StatusPillProps) {
  const cls = {
    scheduled: "pill",
    locked: "pill-locked",
    live: "pill-live",
    finished: "pill-finished",
  }[status];
  return <span className={cls}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cx("animate-spin", className ?? "h-5 w-5")}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 py-10 text-center">
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="max-w-sm text-sm text-slate-600 dark:text-slate-300">{description}</p>}
      {action}
    </div>
  );
}

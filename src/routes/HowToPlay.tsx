import { Link } from "react-router-dom";

export function HowToPlay() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-24 pt-8">
      <header className="space-y-2 text-center">
        <div className="text-5xl">⚽</div>
        <h1 className="text-3xl font-bold tracking-tight">How to play</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Predict every match. Pick the bold calls. Climb the leaderboard.
        </p>
      </header>

      {/* The basics — 3 steps */}
      <section className="grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Join a group">
          Create an account, then create a group or join one with a 6-char invite code from a friend.
        </Step>
        <Step n={2} title="Make picks">
          Two things to predict: <strong>every match</strong> and <strong>5 outright bets</strong>.
        </Step>
        <Step n={3} title="Earn points">
          Points stack across the tournament. Whoever has the most by the Final wins the pool.
        </Step>
      </section>

      {/* Match predictions */}
      <Section title="📅 Match predictions" subtitle="Pick the winner + optional exact score for every match.">
        <Grid>
          <PointPill label="Group stage" outcome={3} bonus={2} />
          <PointPill label="Round of 32" outcome={5} bonus={3} />
          <PointPill label="Round of 16" outcome={8} bonus={5} />
          <PointPill label="Quarterfinals" outcome={12} bonus={8} />
          <PointPill label="Semifinals" outcome={18} bonus={10} />
          <PointPill label="Final" outcome={25} bonus={15} />
        </Grid>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-slate-900 dark:text-slate-100">+outcome</span> for the right winner.{" "}
          <span className="font-semibold text-emerald-700 dark:text-emerald-400">+bonus</span> extra if your exact score also
          matches. Knockout draws aren't a thing — pick a winner.
        </p>
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          <span className="font-semibold text-amber-700 dark:text-amber-400">⚽ Goes to penalties:</span> on
          a knockout match, tick the box and the <span className="font-semibold text-emerald-700 dark:text-emerald-400">+bonus</span>{" "}
          pays out if the match actually goes to PKs — even if you miss the winner. It's the same value as nailing the
          exact regulation score (so calling PKs and predicting a score are alternative paths to the same bonus).
        </p>
      </Section>

      {/* Outright bets */}
      <Section
        title="🎯 Outright bets"
        subtitle="Five big-call picks made before the tournament starts. Locked at first kickoff."
      >
        <ul className="space-y-2 text-sm">
          <Outright emoji="🏆" name="Champion" pts="+50">
            Pick the World Cup winner.
          </Outright>
          <Outright emoji="🥈" name="Runner-up" pts="+30">
            Pick the team that loses the final.
          </Outright>
          <Outright emoji="🎯" name="Group Winners" pts="+5 × 12">
            Pick who tops each of the 12 groups (max +60).
          </Outright>
          <Outright emoji="⚔️" name="Semifinalists" pts="+10 × 4">
            Pick 4 teams that reach the semis. Partial credit.
          </Outright>
          <Outright emoji="💥" name="Underperformer" pts="+20">
            Pick a Pot 1 / Pot 2 favourite that <em>doesn't</em> make it past the group stage.
          </Outright>
        </ul>
      </Section>

      {/* Lock rules */}
      <Section title="🔒 When picks lock" subtitle="No back-dating, no take-backs.">
        <div className="grid gap-2 sm:grid-cols-2">
          <LockRow when="15 minutes before kickoff" what="Each individual match prediction" />
          <LockRow when="First match (June 11, noon)" what="All 5 outright bets" />
        </div>
        <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          Predictions autosave the moment you tap. You can change them up until the lock time.
        </p>
      </Section>

      {/* Tournament timeline */}
      <Section title="📆 Tournament timeline" subtitle="Mark your calendar.">
        <ol className="space-y-2 text-sm">
          <TimelineRow date="June 11" text="Opening match: Mexico vs South Africa. Outrights lock at noon." />
          <TimelineRow date="June 11 – 27" text="Group stage (72 matches across 12 groups)." />
          <TimelineRow date="June 28 – July 3" text="Round of 32 (knockouts begin)." />
          <TimelineRow date="July 4 – 11" text="R16 + Quarterfinals. Points start escalating." />
          <TimelineRow date="July 14 – 15" text="Semifinals." />
          <TimelineRow date="July 19" text="Final at MetLife Stadium. Champion + Runner-up resolve." />
        </ol>
      </Section>

      {/* Quick tips */}
      <Section title="💡 Pro tips" subtitle="Three habits of the leaderboard leaders.">
        <ul className="space-y-2 text-sm">
          <Tip>
            <strong>Set outrights early.</strong> They're the highest single-payout picks. Lock them in
            today so you don't miss the deadline.
          </Tip>
          <Tip>
            <strong>Exact scores are gravy, not the cake.</strong> Get the winner right first; only
            guess scores when you have a strong opinion.
          </Tip>
          <Tip>
            <strong>Knockout points compound.</strong> A correct Final pick (+25 + 15 bonus) is worth
            8x a correct group match. Don't skip those days.
          </Tip>
        </ul>
      </Section>

      <div className="card flex flex-wrap items-center justify-between gap-3 bg-brand-50 dark:bg-brand-500/10">
        <p className="text-sm font-semibold text-brand-900 dark:text-brand-200">Ready to play?</p>
        <Link to="/" className="btn-primary !py-2 text-xs">
          Go to my groups
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-1 text-center">
      <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
        {n}
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-slate-600 dark:text-slate-300">{children}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card space-y-3">
      <header>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </header>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{children}</div>;
}

function PointPill({ label, outcome, bonus }: { label: string; outcome: number; bonus: number }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 px-3 py-2 text-center dark:bg-slate-800/50">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-bold">
        +{outcome} <span className="text-emerald-600">+{bonus}</span>
      </div>
    </div>
  );
}

function Outright({
  emoji,
  name,
  pts,
  children,
}: {
  emoji: string;
  name: string;
  pts: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="text-xl leading-none">{emoji}</span>
      <div className="flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-semibold">{name}</span>
          <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {pts}
          </span>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300">{children}</p>
      </div>
    </li>
  );
}

function LockRow({ when, what }: { when: string; what: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300">{when}</div>
      <div className="mt-0.5 text-sm font-medium text-amber-900 dark:text-amber-200">{what}</div>
    </div>
  );
}

function TimelineRow({ date, text }: { date: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {date}
      </span>
      <span className="text-slate-700 dark:text-slate-300">{text}</span>
    </li>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-0.5 text-emerald-600">✓</span>
      <span className="flex-1 text-slate-700 dark:text-slate-300">{children}</span>
    </li>
  );
}

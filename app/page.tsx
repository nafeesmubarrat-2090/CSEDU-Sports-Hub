import Link from 'next/link'
import GoogleSignInButton from '@/components/GoogleSignInButton'

const highlights = [
  'Approve and publish events quickly',
  'Coordinate teams, rosters, and fixtures',
  'Track results and activity in one place',
]

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-80px)] bg-transparent">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        <div className="overflow-hidden rounded-lg border border-border bg-surface p-8 shadow-[var(--shadow-card)] sm:p-10 lg:p-14">
          <div className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <div className="inline-flex items-center rounded-full border border-secondary/30 bg-secondary-soft px-3 py-1 text-xs font-semibold uppercase tracking-widest text-secondary">
                <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-secondary" />
                CSE DU Sports • Department operations made simple
              </div>
              <h1 className="mt-6 font-display text-4xl font-extrabold uppercase leading-[1.05] tracking-tight text-text sm:text-5xl">
                Plan better matches, manage teams, and run every event with confidence.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted">
                Bring proposals, approvals, team rosters, fixtures, and post-event updates into a single polished workspace for your department.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/events" className="btn-primary">
                  Explore events
                </Link>
                <GoogleSignInButton className="btn-secondary" label="Sign in" />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-bg p-6 shadow-[var(--shadow-card)]">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">What this workspace covers</p>
              <ul className="mt-6 space-y-3">
                {highlights.map((item) => (
                  <li key={item} className="flex items-start gap-3 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-text">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(242,183,5,0.6)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Fast approvals', 'Review and publish proposals without switching tools.'],
            ['Live coordination', 'Keep captains and organizers aligned around teams and matches.'],
            ['Clear visibility', 'See event progress, standings, and updates at a glance.'],
          ].map(([title, body]) => (
            <div key={title} className="card card-hover">
              <h2 className="section-title">{title}</h2>
              <p className="mt-2 text-sm leading-7 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
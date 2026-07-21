import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventRow = Database['public']['Tables']['events']['Row']
type Lifecycle = Database['public']['Enums']['event_lifecycle']

type PageProps = {
  params: Promise<{
    eventId: string
  }>
}

const LIFECYCLE_OPTIONS: { value: Lifecycle; label: string }[] = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
]

function formatDate(value: string | null) {
  if (!value) {
    return 'TBA'
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value))
}

function statusBadgeClass(status: EventRow['status']) {
  switch (status) {
    case 'approved':
      return 'badge-approved'
    case 'pending':
      return 'badge-pending'
    case 'rejected':
      return 'badge-rejected'
    case 'completed':
      return 'badge-completed'
  }
}

function lifecycleBadgeClass(lifecycle: Lifecycle) {
  switch (lifecycle) {
    case 'upcoming':
      return 'badge-upcoming'
    case 'ongoing':
      return 'badge-ongoing'
    case 'completed':
      return 'badge-finished'
    case 'cancelled':
      return 'badge-cancelled'
  }
}

export default async function EventOverviewPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const { data: event, error } = await supabase
    .from('events')
    .select(
      'id, name, sport, description, status, lifecycle, start_date, end_date, created_by, approved_by, created_at, updated_at'
    )
    .eq('id', eventId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!event) {
    notFound()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  let isAdmin = false
  let canManage = false

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('global_role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      throw new Error(profileError.message)
    }

    isAdmin = profile?.global_role === 'admin'

    const { data: isManager } = await supabase.rpc('is_event_manager_of', {
      uid: user.id,
      eid: eventId,
    })
    canManage = Boolean(isManager)
  }

  // Champion detection: the final is the match with no next_match_id. If it has a
  // winner, the tournament is decided regardless of whether the manager flipped the
  // lifecycle to "completed" yet.
  const [{ data: teams }, { data: matches }] = await Promise.all([
    supabase.from('teams').select('id, name, logo_url').eq('event_id', eventId),
    supabase
      .from('matches')
      .select('id, winner_id, next_match_id')
      .eq('event_id', eventId),
  ])

  const teamMap = new Map((teams ?? []).map((team) => [team.id, team]))
  const finalMatch = (matches ?? []).find((match) => match.next_match_id === null)
  const champion =
    finalMatch && finalMatch.winner_id ? teamMap.get(finalMatch.winner_id) ?? null : null

  const teamCount = teams?.length ?? 0
  const matchCount = matches?.length ?? 0

  async function approveEvent() {
    'use server'

    const supabase = await createClient()
    const { error } = await supabase.rpc('approve_event', {
      target_event: eventId,
    })

    if (error) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`)
    }

    redirect(`/events/${eventId}`)
  }

  async function rejectEvent() {
    'use server'

    const supabase = await createClient()
    const { error } = await supabase
      .from('events')
      .update({
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)

    if (error) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`)
    }

    redirect(`/events/${eventId}`)
  }

  async function updateLifecycle(formData: FormData) {
    'use server'

    const next = String(formData.get('lifecycle') ?? '') as Lifecycle
    const allowed: Lifecycle[] = ['upcoming', 'ongoing', 'completed', 'cancelled']
    if (!allowed.includes(next)) {
      redirect(`/events/${eventId}?error=${encodeURIComponent('Invalid status')}`)
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('events')
      .update({ lifecycle: next, updated_at: new Date().toISOString() })
      .eq('id', eventId)

    if (error) {
      redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`)
    }

    redirect(`/events/${eventId}`)
  }

  const eventTabs = [
    { href: `/events/${eventId}/teams`, label: 'Teams' },
    { href: `/events/${eventId}/bracket`, label: 'Bracket' },
    { href: `/events/${eventId}/budget`, label: 'Budget' },
    { href: `/events/${eventId}/activity`, label: 'Activity' },
    { href: `/events/${eventId}/leaderboard`, label: 'Leaderboard' },
  ]

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 lg:px-10">
      <p className="breadcrumb">
        <Link href="/events">Events</Link>
        {' / '}
        <span className="text-text">Overview</span>
      </p>

      {/* Hero */}
      <section className="event-hero mt-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={lifecycleBadgeClass(event.lifecycle)}>
                {event.lifecycle === 'ongoing' ? <span className="live-dot" /> : null}
                {event.lifecycle}
              </span>
              <span className={statusBadgeClass(event.status)}>{event.status}</span>
            </div>
            <h1 className="mt-3 page-title">{event.name}</h1>
            <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-primary">
              {event.sport ?? 'Sport TBD'}
            </p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="label">Starts</dt>
            <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.start_date)}</dd>
          </div>
          <div>
            <dt className="label">Ends</dt>
            <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.end_date)}</dd>
          </div>
          <div>
            <dt className="label">Teams</dt>
            <dd className="mt-1 font-mono text-sm text-text">{teamCount}</dd>
          </div>
          <div>
            <dt className="label">Matches</dt>
            <dd className="mt-1 font-mono text-sm text-text">{matchCount}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        {eventTabs.map((tab) => (
          <Link key={tab.href} href={tab.href} className="btn-ghost">
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Champion card — appears once the bracket final has a winner */}
      {champion ? (
        <section className="champion-card mt-8">
          <p className="font-display text-xs font-bold uppercase tracking-[0.3em] text-primary">
            Champion
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <span className="text-3xl" aria-hidden>
              🏆
            </span>
            <span className="font-display text-3xl font-extrabold uppercase tracking-tight text-text">
              {champion.name}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Winner of {event.name}
            {event.lifecycle !== 'completed'
              ? ' — mark the event completed to make it official.'
              : '.'}
          </p>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="card">
          <h2 className="section-title">Details</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-muted">
            {event.description || 'No description provided.'}
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="label">Start date</dt>
              <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.start_date)}</dd>
            </div>
            <div>
              <dt className="label">End date</dt>
              <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.end_date)}</dd>
            </div>
            <div>
              <dt className="label">Created at</dt>
              <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.created_at)}</dd>
            </div>
            <div>
              <dt className="label">Last updated</dt>
              <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.updated_at)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-4">
          {/* Lifecycle control — managers and admins can set the run state */}
          {canManage ? (
            <section className="card">
              <h2 className="section-title">Event status</h2>
              <p className="mt-2 text-sm text-muted">Set where this event is in its run.</p>
              <form action={updateLifecycle} className="mt-4 space-y-3">
                <select
                  name="lifecycle"
                  defaultValue={event.lifecycle}
                  className="input"
                  aria-label="Event lifecycle status"
                >
                  {LIFECYCLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-primary w-full">
                  Update status
                </button>
              </form>
            </section>
          ) : (
            <section className="card">
              <h2 className="section-title">Event status</h2>
              <p className="mt-2 flex items-center gap-2 text-sm text-muted">
                <span className={lifecycleBadgeClass(event.lifecycle)}>
                  {event.lifecycle === 'ongoing' ? <span className="live-dot" /> : null}
                  {event.lifecycle}
                </span>
              </p>
            </section>
          )}

          <section className="card">
            <h2 className="section-title">Approval</h2>
            <p className="mt-2 text-sm text-muted">
              {event.status === 'pending'
                ? 'This proposal is waiting for admin review.'
                : event.status === 'approved'
                  ? 'This event is publicly visible.'
                  : event.status === 'rejected'
                    ? 'This proposal was rejected.'
                    : 'This event is completed.'}
            </p>
          </section>

          {isAdmin && event.status === 'pending' ? (
            <section className="card">
              <h2 className="section-title">Admin actions</h2>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <form action={approveEvent}>
                  <button type="submit" className="btn-success w-full sm:w-auto">
                    Approve
                  </button>
                </form>

                <form action={rejectEvent}>
                  <button type="submit" className="btn-danger w-full sm:w-auto">
                    Reject
                  </button>
                </form>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  )
}

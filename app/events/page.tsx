import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventSummary = Pick<
  Database['public']['Tables']['events']['Row'],
  'id' | 'name' | 'sport' | 'status' | 'start_date' | 'end_date' | 'created_at' | 'created_by'
>

type Status = Database['public']['Enums']['event_status']

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

function getStatusBadge(status: Status) {
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

function EventCard({ event }: { event: EventSummary }) {
  return (
    <article className="card card-hover group">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold uppercase tracking-tight text-text">
            <Link href={`/events/${event.id}`} className="transition group-hover:text-primary">
              {event.name}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-muted">{event.sport ?? 'Sport TBD'}</p>
        </div>
        <span className={getStatusBadge(event.status)}>
          {event.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-muted sm:grid-cols-3">
        <div>
          <dt className="label">Starts</dt>
          <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.start_date)}</dd>
        </div>
        <div>
          <dt className="label">Ends</dt>
          <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.end_date)}</dd>
        </div>
        <div>
          <dt className="label">Created</dt>
          <dd className="mt-1 font-mono text-sm text-text">{formatDate(event.created_at)}</dd>
        </div>
      </dl>
    </article>
  )
}

export default async function EventsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('events')
    .select('id, name, sport, status, start_date, end_date, created_at, created_by')
    .order('start_date', { ascending: true, nullsFirst: false })

  if (error) {
    throw new Error(error.message)
  }

  const events: EventSummary[] = data ?? []

  const approvedEvents = events.filter((event) => event.status === 'approved')
  const pendingEvents = user
    ? events.filter((event) => event.status === 'pending' && event.created_by === user.id)
    : []

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Approved events are public. If you are signed in, you will also see your own
            pending proposals.
          </p>
        </div>
        <Link href="/events/new" className="btn-primary">
          Propose an event
        </Link>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="section-title">Approved events</h2>
          <span className="font-mono text-sm text-muted">{approvedEvents.length} total</span>
        </div>

        {approvedEvents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {approvedEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No approved events yet.
          </div>
        )}
      </section>

      {user ? (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="section-title">My pending proposals</h2>
            <span className="font-mono text-sm text-muted">{pendingEvents.length} pending</span>
          </div>

          {pendingEvents.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pendingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              You do not have any pending event proposals.
            </div>
          )}
        </section>
      ) : null}
    </main>
  )
}
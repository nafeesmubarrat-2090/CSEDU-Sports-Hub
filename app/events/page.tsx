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

function getStatusStyles(status: Status) {
  switch (status) {
    case 'approved':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    case 'rejected':
      return 'bg-rose-50 text-rose-700 ring-rose-200'
    case 'completed':
      return 'bg-slate-100 text-slate-700 ring-slate-200'
  }
}

function EventCard({ event }: { event: EventSummary }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            <Link href={`/events/${event.id}`} className="hover:underline">
              {event.name}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-slate-600">{event.sport ?? 'Sport TBD'}</p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${getStatusStyles(
            event.status
          )}`}
        >
          {event.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Starts</dt>
          <dd className="mt-1 text-slate-900">{formatDate(event.start_date)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Ends</dt>
          <dd className="mt-1 text-slate-900">{formatDate(event.end_date)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-400">Created</dt>
          <dd className="mt-1 text-slate-900">{formatDate(event.created_at)}</dd>
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
          <h1 className="text-3xl font-semibold text-slate-950">Events</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Approved events are public. If you are signed in, you will also see your own
            pending proposals.
          </p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Propose an event
        </Link>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Approved events</h2>
          <span className="text-sm text-slate-500">{approvedEvents.length} total</span>
        </div>

        {approvedEvents.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {approvedEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
            No approved events yet.
          </div>
        )}
      </section>

      {user ? (
        <section className="mt-12">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">My pending proposals</h2>
            <span className="text-sm text-slate-500">{pendingEvents.length} pending</span>
          </div>

          {pendingEvents.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {pendingEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
              You do not have any pending event proposals.
            </div>
          )}
        </section>
      ) : null}
    </main>
  )
}
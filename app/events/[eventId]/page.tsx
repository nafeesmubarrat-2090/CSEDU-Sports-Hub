import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventRow = Database['public']['Tables']['events']['Row']

type PageProps = {
  params: Promise<{
    eventId: string
  }>
}

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
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'pending':
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    case 'rejected':
      return 'bg-rose-50 text-rose-700 ring-rose-200'
    case 'completed':
      return 'bg-slate-100 text-slate-700 ring-slate-200'
  }
}

export default async function EventOverviewPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const { data: event, error } = await supabase
    .from('events')
    .select('id, name, sport, description, status, start_date, end_date, created_by, approved_by, created_at, updated_at')
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
  }

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

  const eventTabs = [
    { href: `/events/${eventId}/teams`, label: 'Teams' },
    { href: `/events/${eventId}/bracket`, label: 'Bracket' },
    { href: `/events/${eventId}/budget`, label: 'Budget' },
    { href: `/events/${eventId}/activity`, label: 'Activity' },
    { href: `/events/${eventId}/leaderboard`, label: 'Leaderboard' },
  ]

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/events" className="hover:underline">
              Events
            </Link>{' '}
            / Overview
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{event.name}</h1>
          <p className="mt-2 text-sm text-slate-600">{event.sport ?? 'Sport TBD'}</p>
        </div>

        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(
            event.status
          )}`}
        >
          {event.status}
        </span>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {eventTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Details</h2>
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-700">
            {event.description || 'No description provided.'}
          </p>

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Start date</dt>
              <dd className="mt-1 text-sm text-slate-900">{formatDate(event.start_date)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">End date</dt>
              <dd className="mt-1 text-sm text-slate-900">{formatDate(event.end_date)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Created at</dt>
              <dd className="mt-1 text-sm text-slate-900">{formatDate(event.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Last updated</dt>
              <dd className="mt-1 text-sm text-slate-900">{formatDate(event.updated_at)}</dd>
            </div>
          </dl>
        </section>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Event status</h2>
            <p className="mt-2 text-sm text-slate-600">
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
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Admin actions</h2>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <form action={approveEvent}>
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 sm:w-auto"
                  >
                    Approve
                  </button>
                </form>

                <form action={rejectEvent}>
                  <button
                    type="submit"
                    className="inline-flex w-full items-center justify-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-500 sm:w-auto"
                  >
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
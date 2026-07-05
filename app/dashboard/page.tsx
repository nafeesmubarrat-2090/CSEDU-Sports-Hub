import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventRow = Pick<
  Database['public']['Tables']['events']['Row'],
  'id' | 'name' | 'sport' | 'status' | 'start_date' | 'end_date'
>

type TeamRow = Pick<Database['public']['Tables']['teams']['Row'], 'id' | 'name' | 'event_id'>

type TeamMembershipRow = Pick<Database['public']['Tables']['team_members']['Row'], 'id' | 'team_id' | 'role'>

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

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: createdEvents = [], error: createdEventsError }, { data: memberships = [], error: membershipsError }] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, sport, status, start_date, end_date')
      .eq('created_by', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('team_members')
      .select('id, team_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  if (createdEventsError) {
    throw new Error(createdEventsError.message)
  }

  if (membershipsError) {
    throw new Error(membershipsError.message)
  }

  const membershipsList = (memberships ?? []) as TeamMembershipRow[]
  const teamIds = Array.from(new Set(membershipsList.map((membership) => membership.team_id)))

  const { data: teams = [], error: teamsError } =
    teamIds.length > 0
      ? await supabase.from('teams').select('id, name, event_id').in('id', teamIds)
      : { data: [] as TeamRow[], error: null }

  if (teamsError) {
    throw new Error(teamsError.message)
  }

  const teamsList = (teams ?? []) as TeamRow[]
  const eventIds = Array.from(new Set(teamsList.map((team) => team.event_id)))

  const { data: teamEvents = [], error: teamEventsError } =
    eventIds.length > 0
      ? await supabase
          .from('events')
          .select('id, name, sport, status, start_date, end_date')
          .in('id', eventIds)
      : { data: [] as EventRow[], error: null }

  if (teamEventsError) {
    throw new Error(teamEventsError.message)
  }

  const createdEventsList = (createdEvents ?? []) as EventRow[]
  const teamEventsList = (teamEvents ?? []) as EventRow[]
  const teamEventMap = new Map(teamEventsList.map((event) => [event.id, event]))
  const teamMap = new Map(teamsList.map((team) => [team.id, team]))

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-slate-950">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your created events and the teams you are part of.
          </p>
        </div>

        <div className="flex gap-3">
          <Link
            href="/events"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            View events
          </Link>
          <Link
            href="/events/new"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Propose event
          </Link>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Events you created</h2>

        {createdEventsList.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {createdEventsList.map((event) => (
              <article key={event.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{event.name}</h3>
                    <p className="mt-1 text-sm text-slate-600">{event.sport ?? 'Sport TBD'}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {event.status}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Starts</dt>
                    <dd className="mt-1 text-slate-900">{formatDate(event.start_date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Ends</dt>
                    <dd className="mt-1 text-slate-900">{formatDate(event.end_date)}</dd>
                  </div>
                </dl>

                <Link href={`/events/${event.id}`} className="mt-5 inline-flex text-sm font-medium text-slate-900 underline-offset-4 hover:underline">
                  Open event
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
            You have not created any events yet.
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-semibold text-slate-900">Teams you are on</h2>

        {membershipsList.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {membershipsList.map((membership) => {
              const team = teamMap.get(membership.team_id)
              const teamEvent = team ? teamEventMap.get(team.event_id) : undefined

              return (
                <article key={membership.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">{team?.name ?? 'Team'}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {teamEvent?.name ?? 'Event unavailable'}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {membership.role}
                    </span>
                  </div>

                  <Link
                    href={team ? `/events/${team.event_id}/teams/${team.id}` : '/events'}
                    className="mt-5 inline-flex text-sm font-medium text-slate-900 underline-offset-4 hover:underline"
                  >
                    Open team
                  </Link>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
            You are not on any teams yet.
          </div>
        )}
      </section>
    </main>
  )
}
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

  const [{ data: managedRows = [], error: managedError }, { data: memberships = [], error: membershipsError }] = await Promise.all([
    supabase
      .from('event_managers')
      .select('event_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('team_members')
      .select('id, team_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
  ])

  if (managedError) {
    throw new Error(managedError.message)
  }

  if (membershipsError) {
    throw new Error(membershipsError.message)
  }

  const managedEventIds = Array.from(
    new Set(((managedRows ?? []) as { event_id: string }[]).map((row) => row.event_id)),
  )

  const { data: managedEvents = [], error: managedEventsError } =
    managedEventIds.length > 0
      ? await supabase
          .from('events')
          .select('id, name, sport, status, start_date, end_date')
          .in('id', managedEventIds)
          .order('created_at', { ascending: false })
      : { data: [] as EventRow[], error: null }

  if (managedEventsError) {
    throw new Error(managedEventsError.message)
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

  const managedEventsList = (managedEvents ?? []) as EventRow[]
  const teamEventsList = (teamEvents ?? []) as EventRow[]
  const teamEventMap = new Map(teamEventsList.map((event) => [event.id, event]))
  const teamMap = new Map(teamsList.map((team) => [team.id, team]))

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="mt-2 text-sm text-muted">
            The events you manage and the teams you are part of.
          </p>
        </div>

        <div className="flex gap-3">
          <Link href="/events" className="btn-secondary">
            View events
          </Link>
          <Link href="/events/new" className="btn-primary">
            Propose event
          </Link>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Events you manage</h2>
          <span className="font-mono text-sm text-muted">{managedEventsList.length} event{managedEventsList.length !== 1 ? 's' : ''}</span>
        </div>

        {managedEventsList.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {managedEventsList.map((event) => (
              <article key={event.id} className="card card-hover">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-display text-lg font-bold text-text">{event.name}</h3>
                    <p className="mt-1 text-sm text-muted">{event.sport ?? 'Sport TBD'}</p>
                  </div>
                  <span className={event.status === 'approved' ? 'badge-approved' : event.status === 'pending' ? 'badge-pending' : event.status === 'rejected' ? 'badge-rejected' : 'badge-neutral'}>
                    {event.status}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="label">Starts</dt>
                    <dd className="mt-1 font-mono text-text">{formatDate(event.start_date)}</dd>
                  </div>
                  <div>
                    <dt className="label">Ends</dt>
                    <dd className="mt-1 font-mono text-text">{formatDate(event.end_date)}</dd>
                  </div>
                </dl>

                <Link href={`/events/${event.id}`} className="mt-5 inline-flex text-sm font-semibold text-secondary underline-offset-4 hover:text-secondary-strong hover:underline">
                  Open event
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 empty-state">
            You are not managing any events yet.
          </div>
        )}
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Teams you are on</h2>
          <span className="font-mono text-sm text-muted">{membershipsList.length} team{membershipsList.length !== 1 ? 's' : ''}</span>
        </div>

        {membershipsList.length > 0 ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {membershipsList.map((membership) => {
              const team = teamMap.get(membership.team_id)
              const teamEvent = team ? teamEventMap.get(team.event_id) : undefined

              return (
                <article key={membership.id} className="card card-hover">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-display text-lg font-bold text-text">{team?.name ?? 'Team'}</h3>
                      <p className="mt-1 text-sm text-muted">
                        {teamEvent?.name ?? 'Event unavailable'}
                      </p>
                    </div>
                    <span className={membership.role === 'manager' ? 'badge-approved' : 'badge-neutral'}>
                      {membership.role}
                    </span>
                  </div>

                  <Link
                    href={team ? `/events/${team.event_id}/teams/${team.id}` : '/events'}
                    className="mt-5 inline-flex text-sm font-semibold text-secondary underline-offset-4 hover:text-secondary-strong hover:underline"
                  >
                    Open team
                  </Link>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="mt-4 empty-state">
            You are not on any teams yet.
          </div>
        )}
      </section>
    </main>
  )
}
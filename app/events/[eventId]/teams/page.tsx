import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventSummary = Pick<Database['public']['Tables']['events']['Row'], 'id' | 'name'>
type TeamSummary = Pick<
  Database['public']['Tables']['teams']['Row'],
  'id' | 'event_id' | 'name' | 'logo_url'
>
type TeamMemberSummary = Pick<
  Database['public']['Tables']['team_members']['Row'],
  'team_id' | 'role'
>

type PageProps = {
  params: Promise<{
    eventId: string
  }>
}

function countPlayers(teamId: string, teamMembers: TeamMemberSummary[]) {
  return teamMembers.filter((member) => member.team_id === teamId && member.role === 'player').length
}

function TeamLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="h-full w-full object-cover" />
    )
  }

  return <span>{name.slice(0, 2).toUpperCase()}</span>
}

function TeamCard({ team, playerCount }: { team: TeamSummary; playerCount: number }) {
  return (
    <article className="card card-hover group">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 font-display text-sm font-bold uppercase text-primary">
          <TeamLogo name={team.name} logoUrl={team.logo_url} />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-bold uppercase tracking-tight text-text">
            <Link href={`/events/${team.event_id}/teams/${team.id}`} className="transition group-hover:text-primary">
              {team.name}
            </Link>
          </h2>
          <p className="mt-1 text-sm text-muted">
            <span className="font-mono text-text">{playerCount}</span> {playerCount === 1 ? 'player' : 'players'}
          </p>
        </div>
      </div>
    </article>
  )
}

export default async function EventTeamsPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event, error: eventError }, { data: teams, error: teamsError }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).maybeSingle(),
    supabase
      .from('teams')
      .select('id, event_id, name, logo_url')
      .eq('event_id', eventId)
      .order('name', { ascending: true }),
  ])

  if (eventError) {
    throw new Error(eventError.message)
  }

  if (teamsError) {
    throw new Error(teamsError.message)
  }

  if (!event) {
    notFound()
  }

  const teamList = (teams ?? []) as TeamSummary[]
  const teamIds = teamList.map((team) => team.id)

  const { data: teamMembers, error: membersError } =
    teamIds.length > 0
      ? await supabase.from('team_members').select('team_id, role').in('team_id', teamIds)
      : { data: [] as TeamMemberSummary[], error: null }

  if (membersError) {
    throw new Error(membersError.message)
  }

  const teamMembersList = (teamMembers ?? []) as TeamMemberSummary[]

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="breadcrumb">
            <Link href={`/events/${eventId}`}>{event.name}</Link>
            {' / '}
            <span className="text-text">Teams</span>
          </p>
          <h1 className="mt-2 page-title">Teams</h1>
          <p className="mt-2 text-sm text-muted">
            Public team list for this event. Player counts update as rosters grow.
          </p>
        </div>

        <Link href={`/events/${eventId}/teams/new`} className="btn-primary">
          Create team
        </Link>
      </div>

      <section className="mt-10">
        {teamList.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teamList.map((team) => (
              <TeamCard key={team.id} team={team} playerCount={countPlayers(team.id, teamMembersList)} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No teams have been created for this event yet.
          </div>
        )}
      </section>
    </main>
  )
}
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventSummary = Pick<Database['public']['Tables']['events']['Row'], 'id' | 'name'>
type TeamSummary = Pick<Database['public']['Tables']['teams']['Row'], 'id' | 'event_id' | 'name' | 'logo_url'>
type TeamMemberSummary = Pick<
  Database['public']['Tables']['team_members']['Row'],
  'id' | 'team_id' | 'user_id' | 'role' | 'jersey_number' | 'position' | 'added_by'
>
type ProfileSummary = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'avatar_url' | 'global_role' | 'username'
>

type SearchParams = Promise<{
  q?: string
  error?: string
  success?: string
}>

type PageProps = {
  params: Promise<{
    eventId: string
    teamId: string
  }>
  searchParams?: SearchParams
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

export default async function TeamDashboardPage({ params, searchParams }: PageProps) {
  const { eventId, teamId } = await params
  const query = (await searchParams) ?? {}
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: event, error: eventError }, { data: team, error: teamError }, { data: roster, error: rosterError }] =
    await Promise.all([
      supabase.from('events').select('id, name').eq('id', eventId).maybeSingle(),
      supabase
        .from('teams')
        .select('id, event_id, name, logo_url')
        .eq('id', teamId)
        .eq('event_id', eventId)
        .maybeSingle(),
      supabase
        .from('team_members')
        .select('id, team_id, user_id, role, jersey_number, position, added_by')
        .eq('team_id', teamId)
        .order('created_at', { ascending: true }),
    ])

  if (eventError) {
    throw new Error(eventError.message)
  }

  if (teamError) {
    throw new Error(teamError.message)
  }

  if (rosterError) {
    throw new Error(rosterError.message)
  }

  if (!event || !team) {
    notFound()
  }

  const rosterRows = (roster ?? []) as TeamMemberSummary[]
  const rosterUserIds = rosterRows.map((member) => member.user_id)

  const [{ data: profiles = [], error: profilesError }, { data: currentProfile, error: currentProfileError }, { data: eventManagers = [], error: eventManagersError }] =
    await Promise.all([
      rosterUserIds.length > 0
        ? supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url, global_role, username')
            .in('id', rosterUserIds)
        : Promise.resolve({ data: [] as ProfileSummary[], error: null }),
      user
        ? supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url, global_role, username')
            .eq('id', user.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      user
        ? supabase
            .from('event_managers')
            .select('event_id, user_id')
            .eq('event_id', eventId)
            .eq('user_id', user.id)
        : Promise.resolve({ data: [], error: null }),
    ])

  if (profilesError) {
    throw new Error(profilesError.message)
  }

  if (currentProfileError) {
    throw new Error(currentProfileError.message)
  }

  if (eventManagersError) {
    throw new Error(eventManagersError.message)
  }

  const profilesList = (profiles ?? []) as ProfileSummary[]
  const eventManagersList = (eventManagers ?? []) as Array<Pick<Database['public']['Tables']['event_managers']['Row'], 'event_id' | 'user_id'>>
  const profileMap = new Map(profilesList.map((profile) => [profile.id, profile]))
  const currentUserIsTeamManager = Boolean(
    user && rosterRows.some((member) => member.user_id === user.id && member.role === 'manager')
  )
  const currentUserIsAdmin = currentProfile?.global_role === 'admin'
  const currentUserIsEventManager = eventManagersList.some((manager) => manager.user_id === user?.id)
  const canManage = currentUserIsAdmin || currentUserIsEventManager || currentUserIsTeamManager

  async function addPlayer(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const userId = String(formData.get('user_id') ?? '').trim()
    const q = String(formData.get('q') ?? '').trim()

    if (!userId) {
      redirect(`/events/${eventId}/teams/${teamId}?q=${encodeURIComponent(q)}&error=${encodeURIComponent('Select a player to add')}`)
    }

    const { data: existingMembership, error: existingMembershipError } = await supabase
      .from('team_members')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingMembershipError) {
      redirect(
        `/events/${eventId}/teams/${teamId}?q=${encodeURIComponent(q)}&error=${encodeURIComponent(existingMembershipError.message)}`
      )
    }

    if (existingMembership?.role === 'manager') {
      redirect(`/events/${eventId}/teams/${teamId}?q=${encodeURIComponent(q)}&success=manager-already-listed`)
    }

    if (existingMembership) {
      redirect(`/events/${eventId}/teams/${teamId}?q=${encodeURIComponent(q)}&error=${encodeURIComponent('This player is already on the team')}`)
    }

    const { error } = await supabase.from('team_members').insert({
      team_id: teamId,
      user_id: userId,
      role: 'player',
      added_by: user.id,
    })

    if (error) {
      redirect(
        `/events/${eventId}/teams/${teamId}?q=${encodeURIComponent(q)}&error=${encodeURIComponent(error.message)}`
      )
    }

    redirect(`/events/${eventId}/teams/${teamId}?q=${encodeURIComponent(q)}&success=player-added`)
  }

  async function removePlayer(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const memberId = String(formData.get('member_id') ?? '').trim()

    if (!memberId) {
      redirect(`/events/${eventId}/teams/${teamId}?error=${encodeURIComponent('Missing roster member id')}`)
    }

    const { error } = await supabase.from('team_members').delete().eq('id', memberId)

    if (error) {
      redirect(`/events/${eventId}/teams/${teamId}?error=${encodeURIComponent(error.message)}`)
    }

    redirect(`/events/${eventId}/teams/${teamId}?success=player-removed`)
  }

  const searchTerm = query.q?.trim() ?? ''
  // Escape LIKE wildcards in user input so `%` / `_` are matched literally.
  const escapedTerm = searchTerm.replace(/[\\%_]/g, (ch) => `\\${ch}`)
  const searchResult = searchTerm && canManage
    ? await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, global_role, username')
        .or(`email.ilike.%${escapedTerm}%,username.ilike.%${escapedTerm}%`)
        .order('username', { ascending: true })
        .limit(10)
    : { data: [] as ProfileSummary[], error: null }

  if (searchResult.error) {
    throw new Error(searchResult.error.message)
  }

  const searchMatches = (searchResult.data ?? []) as ProfileSummary[]
  const rosterProfileList = rosterRows.map((member) => ({
    member,
    profile: profileMap.get(member.user_id),
  }))
  const rosterPlayerUserIdSet = new Set(rosterRows.filter((member) => member.role === 'player').map((member) => member.user_id))

  // MINIMAL CHANGE: Filter the main list into managers and players for display
  const managerList = rosterProfileList.filter((item) => item.member.role === 'manager')
  const playerList = rosterProfileList.filter((item) => item.member.role === 'player')

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="breadcrumb">
            <Link href={`/events/${eventId}/teams`}>{event.name}</Link>
            {' / '}
            <span className="text-text">Teams / Team dashboard</span>
          </p>
          <h1 className="mt-2 page-title">{team.name}</h1>
        </div>

        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 font-display text-base font-bold uppercase text-primary">
          <TeamLogo name={team.name} logoUrl={team.logo_url} />
        </div>
      </div>

      {query.error ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.error}
        </div>
      ) : null}

      {query.success ? (
        <div className="mt-6 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          {query.success === 'player-added'
            ? 'Player added successfully.'
            : query.success === 'manager-already-listed'
              ? 'This manager is already listed for the team.'
              : 'Player removed successfully.'}
        </div>
      ) : null}

      {canManage ? (
        <section className="mt-8 card">
          <h2 className="section-title">Add player</h2>
          <p className="mt-1 text-sm text-muted">Search by email or username, then add the matching user to this roster.</p>

          <form method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              name="q"
              defaultValue={searchTerm}
              placeholder="email or username"
              className="input"
            />
            <button
              type="submit"
              className="btn-secondary whitespace-nowrap"
            >
              Search
            </button>
          </form>

          {searchTerm ? (
            searchMatches.length > 0 ? (
              <ul className="mt-4 flex flex-col gap-2">
                {searchMatches.map((match) => (
                  <li
                    key={match.id}
                    className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-text">
                        {match.full_name}{' '}
                        <span className="font-mono text-sm font-normal text-muted">@{match.username}</span>
                      </p>
                      <p className="truncate text-sm text-muted">{match.email}</p>
                    </div>

                    {rosterPlayerUserIdSet.has(match.id) ? (
                      <span className="text-sm font-medium text-muted">Already on this team</span>
                    ) : (
                      <form action={addPlayer}>
                        <input type="hidden" name="user_id" value={match.id} />
                        <input type="hidden" name="q" value={searchTerm} />
                        <button
                          type="submit"
                          className="btn-primary whitespace-nowrap"
                        >
                          Add player
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-lg border border-border bg-surface-2 p-4">
                <p className="text-sm text-muted">No user was found matching that email or username.</p>
              </div>
            )
          ) : null}

          {/* self-add removed: managers should not add themselves via UI to avoid duplicate display */}
        </section>
      ) : null}

      {/* MINIMAL CHANGE: Manager Section */}
      <section className="mt-8 card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Manager</h2>
          <span className="font-mono text-sm text-muted">{managerList.length} member{managerList.length !== 1 ? 's' : ''}</span>
        </div>

        {managerList.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Manager</th>
                  <th className="px-4 py-3 font-semibold">Jersey</th>
                  <th className="px-4 py-3 font-semibold">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {managerList.map(({ member, profile }) => (
                  <tr key={member.id}>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-text">{profile?.full_name ?? 'Unknown manager'}</div>
                      <div className="text-xs text-muted">{profile?.email ?? 'No email available'}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-text">{member.jersey_number ?? '—'}</td>
                    <td className="px-4 py-4 text-text">{member.position ?? '—'}</td>
                    {/* Manager cannot be removed from the UI; removal disabled intentionally */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 empty-state">
            No manager assigned.
          </div>
        )}
      </section>

      {/* MINIMAL CHANGE: Players Section */}
      <section className="mt-8 card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">Players</h2>
          <span className="font-mono text-sm text-muted">{playerList.length} member{playerList.length !== 1 ? 's' : ''}</span>
        </div>

        {playerList.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Player</th>
                  <th className="px-4 py-3 font-semibold">Jersey</th>
                  <th className="px-4 py-3 font-semibold">Position</th>
                  {canManage ? <th className="px-4 py-3 font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface">
                {playerList.map(({ member, profile }) => (
                  <tr key={member.id}>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-text">{profile?.full_name ?? 'Unknown player'}</div>
                      <div className="text-xs text-muted">{profile?.email ?? 'No email available'}</div>
                    </td>
                    <td className="px-4 py-4 font-mono text-text">{member.jersey_number ?? '—'}</td>
                    <td className="px-4 py-4 text-text">{member.position ?? '—'}</td>
                    {canManage ? (
                      <td className="px-4 py-4">
                        <form action={removePlayer}>
                          <input type="hidden" name="member_id" value={member.id} />
                          <button
                            type="submit"
                            className="btn-danger"
                          >
                            Remove
                          </button>
                        </form>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 empty-state">
            This roster is empty.
          </div>
        )}
      </section>
    </main>
  )
}
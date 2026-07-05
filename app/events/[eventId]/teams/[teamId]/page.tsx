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
  'id' | 'full_name' | 'email' | 'avatar_url' | 'global_role'
>

type SearchParams = Promise<{
  email?: string
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
            .select('id, full_name, email, avatar_url, global_role')
            .in('id', rosterUserIds)
        : Promise.resolve({ data: [] as ProfileSummary[], error: null }),
      user
        ? supabase
            .from('profiles')
            .select('id, full_name, email, avatar_url, global_role')
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
    const email = String(formData.get('email') ?? '').trim()

    if (!userId) {
      redirect(`/events/${eventId}/teams/${teamId}?email=${encodeURIComponent(email)}&error=${encodeURIComponent('Select a player to add')}`)
    }

    const { data: existingMembership, error: existingMembershipError } = await supabase
      .from('team_members')
      .select('id, role')
      .eq('team_id', teamId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingMembershipError) {
      redirect(
        `/events/${eventId}/teams/${teamId}?email=${encodeURIComponent(email)}&error=${encodeURIComponent(existingMembershipError.message)}`
      )
    }

    if (existingMembership?.role === 'manager') {
      redirect(`/events/${eventId}/teams/${teamId}?email=${encodeURIComponent(email)}&success=manager-already-listed`)
    }

    if (existingMembership) {
      redirect(`/events/${eventId}/teams/${teamId}?email=${encodeURIComponent(email)}&error=${encodeURIComponent('This player is already on the team')}`)
    }

    const { error } = await supabase.from('team_members').insert({
      team_id: teamId,
      user_id: userId,
      role: 'player',
      added_by: user.id,
    })

    if (error) {
      redirect(
        `/events/${eventId}/teams/${teamId}?email=${encodeURIComponent(email)}&error=${encodeURIComponent(error.message)}`
      )
    }

    redirect(`/events/${eventId}/teams/${teamId}?email=${encodeURIComponent(email)}&success=player-added`)
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

  const searchEmail = query.email?.trim() ?? ''
  const searchResult = searchEmail && canManage
    ? await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, global_role')
        .eq('email', searchEmail)
        .maybeSingle()
    : { data: null as ProfileSummary | null, error: null }

  if (searchResult.error) {
    throw new Error(searchResult.error.message)
  }

  const searchedProfile = searchResult.data
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
          <p className="text-sm text-slate-500">
            <Link href={`/events/${eventId}/teams`} className="hover:underline">
              {event.name}
            </Link>{' '}
            / Teams / Team dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{team.name}</h1>
        </div>

        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700">
          <TeamLogo name={team.name} logoUrl={team.logo_url} />
        </div>
      </div>

      {query.error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {query.error}
        </div>
      ) : null}

      {query.success ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {query.success === 'player-added'
            ? 'Player added successfully.'
            : query.success === 'manager-already-listed'
              ? 'This manager is already listed for the team.'
              : 'Player removed successfully.'}
        </div>
      ) : null}

      {canManage ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add player</h2>
          <p className="mt-1 text-sm text-slate-600">Search by email and add the matching user to this roster.</p>

          <form method="get" className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              name="email"
              defaultValue={searchEmail}
              placeholder="player@example.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Search
            </button>
          </form>

          {searchEmail ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              {searchedProfile ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-slate-950">{searchedProfile.full_name}</p>
                    <p className="text-sm text-slate-600">{searchedProfile.email}</p>
                  </div>

                  {rosterPlayerUserIdSet.has(searchedProfile.id) ? (
                    <span className="text-sm font-medium text-slate-600">Already on this team</span>
                  ) : (
                    <form action={addPlayer}>
                      <input type="hidden" name="user_id" value={searchedProfile.id} />
                      <input type="hidden" name="email" value={searchedProfile.email} />
                      <button
                        type="submit"
                        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                      >
                        Add player
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-600">No user was found with that email address.</p>
              )}
            </div>
          ) : null}

          {/* self-add removed: managers should not add themselves via UI to avoid duplicate display */}
        </section>
      ) : null}

      {/* MINIMAL CHANGE: Manager Section */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Manager</h2>
          <span className="text-sm text-slate-500">{managerList.length} member{managerList.length !== 1 ? 's' : ''}</span>
        </div>

        {managerList.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Manager</th>
                  <th className="px-4 py-3 font-medium">Jersey</th>
                  <th className="px-4 py-3 font-medium">Position</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {managerList.map(({ member, profile }) => (
                  <tr key={member.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-950">{profile?.full_name ?? 'Unknown manager'}</div>
                      <div className="text-xs text-slate-500">{profile?.email ?? 'No email available'}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{member.jersey_number ?? '—'}</td>
                    <td className="px-4 py-4 text-slate-700">{member.position ?? '—'}</td>
                    {/* Manager cannot be removed from the UI; removal disabled intentionally */}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
            No manager assigned.
          </div>
        )}
      </section>

      {/* MINIMAL CHANGE: Players Section */}
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Players</h2>
          <span className="text-sm text-slate-500">{playerList.length} member{playerList.length !== 1 ? 's' : ''}</span>
        </div>

        {playerList.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Player</th>
                  <th className="px-4 py-3 font-medium">Jersey</th>
                  <th className="px-4 py-3 font-medium">Position</th>
                  {canManage ? <th className="px-4 py-3 font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {playerList.map(({ member, profile }) => (
                  <tr key={member.id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-slate-950">{profile?.full_name ?? 'Unknown player'}</div>
                      <div className="text-xs text-slate-500">{profile?.email ?? 'No email available'}</div>
                    </td>
                    <td className="px-4 py-4 text-slate-700">{member.jersey_number ?? '—'}</td>
                    <td className="px-4 py-4 text-slate-700">{member.position ?? '—'}</td>
                    {canManage ? (
                      <td className="px-4 py-4">
                        <form action={removePlayer}>
                          <input type="hidden" name="member_id" value={member.id} />
                          <button
                            type="submit"
                            className="inline-flex items-center justify-center rounded-lg border border-rose-300 px-3 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-50"
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
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-600">
            This roster is empty.
          </div>
        )}
      </section>
    </main>
  )
}
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConfirmButton from '@/components/ConfirmButton'

type EventSummary = { id: string; name: string }
type TeamSummary = { id: string; name: string; logo_url: string | null }
type FinalMatch = {
  id: string
  team_a_id: string | null
  team_b_id: string | null
  winner_id: string | null
  next_match_id: string | null
}
type AwardRow = {
  id: string
  category: string
  performer: string
  detail: string | null
}
type PlayerStatRow = {
  id: string
  player_id: string
  team_id: string
  points: number
  goals: number
  assists: number
  notes: string | null
}
type ProfileSummary = { id: string; full_name: string | null; email?: string | null }

type PageProps = {
  params: Promise<{
    eventId: string
  }>
  searchParams?: Promise<{
    error?: string
  }>
}

export default async function LeaderboardPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const query = (await searchParams) ?? {}
  const supabase = await createClient()

  const [{ data: event, error: eventError }, { data: eventMatches, error: matchesError }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).maybeSingle(),
    supabase
      .from('matches')
      .select('id, team_a_id, team_b_id, winner_id, next_match_id')
      .eq('event_id', eventId),
  ])

  if (eventError) throw new Error(eventError.message)
  if (matchesError) throw new Error(matchesError.message)
  if (!event) notFound()

  const matches = (eventMatches ?? []) as FinalMatch[]
  const matchIds = matches.map((match) => match.id)

  // Permission: managers/admin get the award editor; everyone else reads.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let canManage = false
  if (user) {
    const { data: isManager } = await supabase.rpc('is_event_manager_of', {
      uid: user.id,
      eid: eventId,
    })
    canManage = Boolean(isManager)
  }

  // Champion + runner-up come straight off the bracket final (next_match_id IS NULL).
  // The runner-up is simply the other team in that same match.
  const finalMatch = matches.find((match) => match.next_match_id === null) ?? null

  const [{ data: teams }, { data: awards, error: awardsError }] = await Promise.all([
    supabase.from('teams').select('id, name, logo_url').eq('event_id', eventId),
    supabase
      .from('event_awards')
      .select('id, category, performer, detail')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
  ])

  if (awardsError) throw new Error(awardsError.message)

  const teamMap = new Map(((teams ?? []) as TeamSummary[]).map((team) => [team.id, team]))
  const champion =
    finalMatch && finalMatch.winner_id ? teamMap.get(finalMatch.winner_id) ?? null : null
  const runnerUpId =
    finalMatch && finalMatch.winner_id
      ? finalMatch.team_a_id === finalMatch.winner_id
        ? finalMatch.team_b_id
        : finalMatch.team_a_id
      : null
  const runnerUp = runnerUpId ? teamMap.get(runnerUpId) ?? null : null

  const awardRows = (awards ?? []) as AwardRow[]

  const { data: stats, error: statsError } = matchIds.length
    ? await supabase
        .from('player_stats')
        .select('id, player_id, team_id, points, goals, assists, notes')
        .in('match_id', matchIds)
        .order('points', { ascending: false })
        .order('goals', { ascending: false })
        .order('assists', { ascending: false })
    : { data: [] as PlayerStatRow[], error: null }

  if (statsError) throw new Error(statsError.message)

  const statRows = (stats ?? []) as PlayerStatRow[]
  const playerIds = Array.from(new Set(statRows.map((row) => row.player_id)))

  const { data: players = [], error: playersError } = playerIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', playerIds)
    : { data: [] as ProfileSummary[], error: null }

  if (playersError) throw new Error(playersError.message)

  const playerMap = new Map(((players ?? []) as ProfileSummary[]).map((player) => [player.id, player]))

  async function addAward(formData: FormData) {
    'use server'

    const category = String(formData.get('category') ?? '').trim()
    const performer = String(formData.get('performer') ?? '').trim()
    const detailRaw = String(formData.get('detail') ?? '').trim()

    if (!category || !performer) {
      redirect(`/events/${eventId}/leaderboard?error=${encodeURIComponent('Category and performer are both required')}`)
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect(`/events/${eventId}/leaderboard?error=${encodeURIComponent('You must be signed in')}`)
    }

    const { error } = await supabase.from('event_awards').insert({
      event_id: eventId,
      category,
      performer,
      detail: detailRaw || null,
      created_by: user!.id,
    })

    if (error) {
      redirect(`/events/${eventId}/leaderboard?error=${encodeURIComponent(error.message)}`)
    }

    redirect(`/events/${eventId}/leaderboard`)
  }

  async function removeAward(formData: FormData) {
    'use server'

    const awardId = String(formData.get('awardId') ?? '')
    if (!awardId) {
      redirect(`/events/${eventId}/leaderboard`)
    }

    const supabase = await createClient()
    const { error } = await supabase.from('event_awards').delete().eq('id', awardId)

    if (error) {
      redirect(`/events/${eventId}/leaderboard?error=${encodeURIComponent(error.message)}`)
    }

    redirect(`/events/${eventId}/leaderboard`)
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="breadcrumb">
            <Link href={`/events/${eventId}`}>{event.name}</Link>
            {' / '}
            <span className="text-text">Leaderboard</span>
          </p>
          <h1 className="mt-2 page-title">Leaderboard</h1>
          <p className="mt-2 text-sm text-muted">
            The event&apos;s champions, curated awards, and top performers all in one place.
          </p>
        </div>
      </div>

      {query.error ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.error}
        </div>
      ) : null}

      {/* Podium — Champion + Runner-up straight off the bracket final */}
      {champion || runnerUp ? (
        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          {champion ? (
            <div className="champion-card">
              <p className="font-display text-xs font-bold uppercase tracking-[0.3em] text-primary">
                Champion
              </p>
              <div className="mt-3 flex items-center justify-center gap-3">
                <span className="text-3xl" aria-hidden>
                  🏆
                </span>
                <span className="font-display text-2xl font-extrabold uppercase tracking-tight text-text">
                  {champion.name}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">Winner of {event.name}</p>
            </div>
          ) : null}

          {runnerUp ? (
            <div className="runnerup-card">
              <p className="font-display text-xs font-bold uppercase tracking-[0.3em] text-slate-300">
                Runner-up
              </p>
              <div className="mt-3 flex items-center justify-center gap-3">
                <span className="text-3xl" aria-hidden>
                  🥈
                </span>
                <span className="font-display text-2xl font-extrabold uppercase tracking-tight text-text">
                  {runnerUp.name}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">Finalist</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Awards — manager-curated recognitions, read-only for everyone else */}
      <section className="mt-8 card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Awards</h2>
          <span className="font-mono text-sm text-muted">
            {awardRows.length} award{awardRows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {awardRows.length === 0 ? (
          <div className="mt-4 empty-state">
            No awards have been added yet.
            {canManage ? ' Use the form below to recognise a top performer.' : ''}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {awardRows.map((award) => (
              <div key={award.id} className="award-card">
                <p className="label">{award.category}</p>
                <p className="mt-2 font-display text-lg font-bold text-text">{award.performer}</p>
                {award.detail ? <p className="mt-1 text-sm text-muted">{award.detail}</p> : null}
                {canManage ? (
                  <form action={removeAward} className="mt-3">
                    <input type="hidden" name="awardId" value={award.id} />
                    <ConfirmButton
                      message={`Remove the "${award.category}" award for ${award.performer}?`}
                      className="text-xs font-semibold text-danger hover:underline"
                    >
                      Remove
                    </ConfirmButton>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canManage ? (
          <form action={addAward} className="mt-6 grid gap-3 border-t border-border pt-6 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="label" htmlFor="award-category">
                Category
              </label>
              <input
                id="award-category"
                name="category"
                required
                placeholder="Top Scorer"
                className="input mt-1"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="label" htmlFor="award-performer">
                Performer
              </label>
              <input
                id="award-performer"
                name="performer"
                required
                placeholder="Player or team name"
                className="input mt-1"
              />
            </div>
            <div className="sm:col-span-1">
              <label className="label" htmlFor="award-detail">
                Detail <span className="text-muted">(optional)</span>
              </label>
              <input
                id="award-detail"
                name="detail"
                placeholder="14 goals"
                className="input mt-1"
              />
            </div>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-primary">
                Add award
              </button>
            </div>
          </form>
        ) : null}
      </section>

      {/* Top performers — auto-computed from recorded player stats */}
      <section className="mt-8 card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Top performers</h2>
          <span className="font-mono text-sm text-muted">{statRows.length} entr{statRows.length !== 1 ? 'ies' : 'y'}</span>
        </div>

        {statRows.length === 0 ? (
          <div className="mt-4 empty-state">
            No player stats have been recorded for this event yet.
          </div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Player</th>
                  <th className="px-4 py-3 font-semibold">Points</th>
                  <th className="px-4 py-3 font-semibold">Goals</th>
                  <th className="px-4 py-3 font-semibold">Assists</th>
                  <th className="px-4 py-3 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface text-sm text-text">
                {statRows.map((row, index) => {
                  const player = playerMap.get(row.player_id)
                  const isTop = index < 3
                  return (
                    <tr key={row.id} className={isTop ? 'bg-primary/5' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full font-mono text-sm font-bold ${isTop ? 'bg-primary text-bg shadow-[0_0_10px_rgba(242,183,5,0.5)]' : 'bg-surface-2 text-muted'}`}>
                            {index + 1}
                          </div>
                          <div>
                            <div className="font-semibold text-text">{player?.full_name ?? 'Unknown player'}</div>
                            <div className="text-xs text-muted">{player?.email ?? 'No email on file'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-primary">{row.points}</td>
                      <td className="px-4 py-3 font-mono text-text">{row.goals}</td>
                      <td className="px-4 py-3 font-mono text-text">{row.assists}</td>
                      <td className="px-4 py-3 text-muted">{row.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

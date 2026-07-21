import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConfirmButton from '@/components/ConfirmButton'

type EventSummary = { id: string; name: string }
type TeamSummary = { id: string; event_id: string; name: string; logo_url: string | null }
type MatchSummary = {
  id: string
  round: number
  match_number: number
  team_a_id: string | null
  team_b_id: string | null
  team_a_score: number | null
  team_b_score: number | null
  winner_id: string | null
  status: string
  scheduled_at: string | null
}

type PageProps = {
  params: Promise<{
    eventId: string
  }>
  searchParams?: Promise<{
    error?: string
  }>
}

const BRACKET_SIZES = [2, 4, 8, 16, 32]

function statusBadgeClass(status: string) {
  switch (status) {
    case 'completed':
      return 'badge-completed'
    case 'in_progress':
      return 'badge-live'
    default:
      return 'badge-neutral'
  }
}

// The final round has 1 match, the one before it 2, etc. Name them accordingly.
function roundLabel(matchesInRound: number) {
  switch (matchesInRound) {
    case 1:
      return 'Final'
    case 2:
      return 'Semifinals'
    case 4:
      return 'Quarterfinals'
    default:
      return `Round of ${matchesInRound * 2}`
  }
}

// Smallest power of two (2..32) that holds every registered team.
function suggestedSize(teamCount: number) {
  for (const size of BRACKET_SIZES) {
    if (size >= teamCount) return size
  }
  return 32
}

export default async function BracketPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const query = (await searchParams) ?? {}
  const supabase = await createClient()

  const [{ data: event, error: eventError }, { data: teams, error: teamsError }, { data: matches, error: matchesError }] =
    await Promise.all([
      supabase.from('events').select('id, name').eq('id', eventId).maybeSingle(),
      supabase
        .from('teams')
        .select('id, event_id, name, logo_url')
        .eq('event_id', eventId)
        .order('name', { ascending: true }),
      supabase
        .from('matches')
        .select(
          'id, round, match_number, team_a_id, team_b_id, team_a_score, team_b_score, winner_id, status, scheduled_at'
        )
        .eq('event_id', eventId)
        .order('round', { ascending: true })
        .order('match_number', { ascending: true }),
    ])

  if (eventError) throw new Error(eventError.message)
  if (teamsError) throw new Error(teamsError.message)
  if (matchesError) throw new Error(matchesError.message)
  if (!event) notFound()

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

  const teamList = (teams ?? []) as TeamSummary[]
  const teamMap = new Map(teamList.map((team) => [team.id, team]))
  const matchRows = (matches ?? []) as MatchSummary[]
  const rounds = Array.from(new Set(matchRows.map((match) => match.round))).sort((a, b) => a - b)
  const hasBracket = matchRows.length > 0

  // The final is the match no other match feeds into. When it has a winner, that team
  // is the tournament champion.
  const maxRound = rounds.length ? rounds[rounds.length - 1] : null
  const finalMatch = maxRound !== null ? matchRows.find((match) => match.round === maxRound) : null
  const champion =
    finalMatch && finalMatch.winner_id ? teamMap.get(finalMatch.winner_id) ?? null : null

  // --- Server actions (all writes go through the security-definer RPCs) --------

  async function generateBracket(formData: FormData) {
    'use server'

    const size = Number(formData.get('size'))
    const supabase = await createClient()
    const { error } = await supabase.rpc('generate_bracket', {
      target_event: eventId,
      team_count: size,
    })

    if (error) {
      redirect(`/events/${eventId}/bracket?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/events/${eventId}/bracket`)
  }

  async function assignTeam(formData: FormData) {
    'use server'

    const matchId = String(formData.get('matchId') ?? '')
    const slot = String(formData.get('slot') ?? '')
    const teamId = String(formData.get('teamId') ?? '')

    if (!matchId || !teamId) {
      redirect(`/events/${eventId}/bracket?error=${encodeURIComponent('Pick a team to assign')}`)
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc('assign_team_to_slot', {
      target_match: matchId,
      slot,
      team: teamId,
    })

    if (error) {
      redirect(`/events/${eventId}/bracket?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/events/${eventId}/bracket`)
  }

  async function promoteBye(formData: FormData) {
    'use server'

    const matchId = String(formData.get('matchId') ?? '')
    const teamId = String(formData.get('teamId') ?? '')

    const supabase = await createClient()
    const { error } = await supabase.rpc('promote_bye', {
      target_match: matchId,
      team: teamId,
    })

    if (error) {
      redirect(`/events/${eventId}/bracket?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/events/${eventId}/bracket`)
  }

  async function reportResult(formData: FormData) {
    'use server'

    const matchId = String(formData.get('matchId') ?? '')
    const winnerId = String(formData.get('winnerId') ?? '')
    const rawScoreA = String(formData.get('scoreA') ?? '').trim()
    const rawScoreB = String(formData.get('scoreB') ?? '').trim()

    if (!winnerId) {
      redirect(`/events/${eventId}/bracket?error=${encodeURIComponent('Select the winner')}`)
    }

    const supabase = await createClient()
    const { error } = await supabase.rpc('report_match_result', {
      target_match: matchId,
      winner: winnerId,
      score_a: rawScoreA === '' ? null : Number(rawScoreA),
      score_b: rawScoreB === '' ? null : Number(rawScoreB),
    })

    if (error) {
      redirect(`/events/${eventId}/bracket?error=${encodeURIComponent(error.message)}`)
    }
    redirect(`/events/${eventId}/bracket`)
  }

  const defaultSize = suggestedSize(Math.max(teamList.length, 2))

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="breadcrumb">
            <Link href={`/events/${eventId}`}>{event.name}</Link>
            {' / '}
            <span className="text-text">Bracket</span>
          </p>
          <h1 className="mt-2 page-title">Bracket</h1>
          <p className="mt-2 text-sm text-muted">
            Single-elimination knockout. Winners advance automatically to the next round.
          </p>
        </div>
      </div>

      {query.error ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.error}
        </div>
      ) : null}

      {/* Champion banner — slim horizontal variant (the event page shows the full card) */}
      {champion ? (
        <div className="champion-banner mt-6">
          <span className="text-2xl" aria-hidden>
            🏆
          </span>
          <div className="min-w-0">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
              Champion
            </p>
            <p className="truncate font-display text-xl font-extrabold uppercase tracking-tight text-text">
              {champion.name}
            </p>
          </div>
        </div>
      ) : null}

      {/* Manager-only bracket setup */}
      {canManage ? (
        <section className="mt-8 card">
          <h2 className="section-title">{hasBracket ? 'Regenerate bracket' : 'Generate bracket'}</h2>
          <p className="mt-2 text-sm text-muted">
            Choose how many slots the bracket has (a power of two, up to 32). You have{' '}
            <span className="font-mono text-text">{teamList.length}</span> registered team
            {teamList.length === 1 ? '' : 's'}. Leave slots empty and fill them below, or use
            auto-promote when a team has no opponent.
          </p>
          {hasBracket ? (
            <p className="mt-2 text-sm text-danger">
              Warning: regenerating wipes every existing match, score, and result for this event.
            </p>
          ) : null}

          <form action={generateBracket} className="mt-5 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="size" className="label">
                Number of teams
              </label>
              <select id="size" name="size" defaultValue={defaultSize} className="input mt-2 w-40">
                {BRACKET_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} teams
                  </option>
                ))}
              </select>
            </div>
            {hasBracket ? (
              <ConfirmButton
                message="Regenerate the bracket? This permanently deletes all existing matches, scores, and results for this event."
                className="btn-danger"
              >
                Regenerate bracket
              </ConfirmButton>
            ) : (
              <button type="submit" className="btn-primary">
                Generate bracket
              </button>
            )}
          </form>
        </section>
      ) : null}

      <section className="mt-8">
        {!hasBracket ? (
          <div className="empty-state">
            {canManage
              ? 'No bracket yet. Pick a size above to generate one.'
              : 'No matches have been created for this event yet.'}
          </div>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-4">
            {rounds.map((round) => {
              const roundMatches = matchRows.filter((match) => match.round === round)
              return (
                <div key={round} className="min-w-[320px] flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-sm font-bold uppercase tracking-widest text-primary">
                      {roundLabel(roundMatches.length)}
                    </h2>
                    <span className="font-mono text-xs text-muted">
                      {roundMatches.length} match{roundMatches.length === 1 ? '' : 'es'}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {roundMatches.map((match) => {
                      const teamA = match.team_a_id ? teamMap.get(match.team_a_id) : null
                      const teamB = match.team_b_id ? teamMap.get(match.team_b_id) : null
                      const isWinnerA = match.winner_id && match.winner_id === match.team_a_id
                      const isWinnerB = match.winner_id && match.winner_id === match.team_b_id
                      const isLive = match.status === 'in_progress'
                      const isDecided = Boolean(match.winner_id)
                      const bothTeamsSet = Boolean(match.team_a_id && match.team_b_id)
                      const oneTeamSet =
                        Boolean(match.team_a_id) !== Boolean(match.team_b_id) // exactly one filled
                      const loneTeamId = match.team_a_id ?? match.team_b_id
                      // Manual seeding is only meaningful in round 1; later rounds fill by advancement.
                      const isFirstRound = round === rounds[0]

                      return (
                        <article
                          key={match.id}
                          className={`rounded-lg border p-4 transition ${
                            isLive
                              ? 'border-primary/60 bg-surface-2 shadow-[var(--shadow-glow-amber)]'
                              : isDecided
                                ? 'border-primary/30 bg-surface'
                                : 'border-border bg-surface'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-display text-xs font-bold uppercase tracking-widest text-muted">
                              Match {match.match_number}
                            </div>
                            <span className={statusBadgeClass(match.status)}>
                              {match.status === 'in_progress' ? 'live' : match.status}
                            </span>
                          </div>

                          <div className="mt-3 space-y-2">
                            <div
                              className={`flex items-center justify-between rounded-md px-3 py-2 transition ${
                                isWinnerA
                                  ? 'border border-primary/50 bg-primary/10 shadow-[0_0_12px_-4px_rgba(242,183,5,0.6)]'
                                  : 'border border-border bg-bg'
                              }`}
                            >
                              <span className={`text-sm font-semibold ${isWinnerA ? 'text-primary' : 'text-text'}`}>
                                {teamA?.name ?? 'TBD'}
                              </span>
                              <span className={`font-mono text-base font-bold ${isWinnerA ? 'text-primary' : 'text-text'}`}>
                                {match.team_a_score ?? '-'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 pl-1">
                              <span className={`bracket-connector ${isDecided ? 'bracket-connector-decided' : ''}`} />
                              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">vs</span>
                              <span className={`bracket-connector ${isDecided ? 'bracket-connector-decided' : ''}`} />
                            </div>

                            <div
                              className={`flex items-center justify-between rounded-md px-3 py-2 transition ${
                                isWinnerB
                                  ? 'border border-primary/50 bg-primary/10 shadow-[0_0_12px_-4px_rgba(242,183,5,0.6)]'
                                  : 'border border-border bg-bg'
                              }`}
                            >
                              <span className={`text-sm font-semibold ${isWinnerB ? 'text-primary' : 'text-text'}`}>
                                {teamB?.name ?? 'TBD'}
                              </span>
                              <span className={`font-mono text-base font-bold ${isWinnerB ? 'text-primary' : 'text-text'}`}>
                                {match.team_b_score ?? '-'}
                              </span>
                            </div>
                          </div>

                          {/* Manager controls */}
                          {canManage && !isDecided ? (
                            <div className="mt-4 space-y-3 border-t border-border pt-3">
                              {/* Seed empty slots (round 1 only) */}
                              {isFirstRound && (!match.team_a_id || !match.team_b_id) ? (
                                <div className="space-y-2">
                                  {(['a', 'b'] as const).map((slot) => {
                                    const filled = slot === 'a' ? match.team_a_id : match.team_b_id
                                    if (filled) return null
                                    return (
                                      <form key={slot} action={assignTeam} className="flex items-center gap-2">
                                        <input type="hidden" name="matchId" value={match.id} />
                                        <input type="hidden" name="slot" value={slot} />
                                        <select name="teamId" defaultValue="" className="input text-xs" required>
                                          <option value="" disabled>
                                            Add team to slot {slot.toUpperCase()}
                                          </option>
                                          {teamList.map((team) => (
                                            <option key={team.id} value={team.id}>
                                              {team.name}
                                            </option>
                                          ))}
                                        </select>
                                        <button type="submit" className="btn-ghost px-3 py-1.5 text-xs">
                                          Add
                                        </button>
                                      </form>
                                    )
                                  })}
                                </div>
                              ) : null}

                              {/* Auto-promote a team with no opponent */}
                              {oneTeamSet && loneTeamId ? (
                                <form action={promoteBye}>
                                  <input type="hidden" name="matchId" value={match.id} />
                                  <input type="hidden" name="teamId" value={loneTeamId} />
                                  <button type="submit" className="btn-secondary w-full px-3 py-1.5 text-xs">
                                    Auto-promote {teamMap.get(loneTeamId)?.name ?? 'team'} (no opponent)
                                  </button>
                                </form>
                              ) : null}

                              {/* Report result: optional scores + winner selection */}
                              {bothTeamsSet ? (
                                <form action={reportResult} className="space-y-2">
                                  <input type="hidden" name="matchId" value={match.id} />
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1">
                                      <label className="label">Score (optional)</label>
                                      <div className="mt-1 flex items-center gap-2">
                                        <input
                                          name="scoreA"
                                          type="number"
                                          min="0"
                                          inputMode="numeric"
                                          placeholder={teamA?.name ?? 'A'}
                                          className="input text-xs"
                                          aria-label={`Score for ${teamA?.name ?? 'team A'}`}
                                        />
                                        <span className="font-mono text-xs text-muted">–</span>
                                        <input
                                          name="scoreB"
                                          type="number"
                                          min="0"
                                          inputMode="numeric"
                                          placeholder={teamB?.name ?? 'B'}
                                          className="input text-xs"
                                          aria-label={`Score for ${teamB?.name ?? 'team B'}`}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                  <div>
                                    <label htmlFor={`winner-${match.id}`} className="label">
                                      Winner
                                    </label>
                                    <select
                                      id={`winner-${match.id}`}
                                      name="winnerId"
                                      defaultValue=""
                                      required
                                      className="input mt-1 text-xs"
                                    >
                                      <option value="" disabled>
                                        Select winner
                                      </option>
                                      {match.team_a_id ? (
                                        <option value={match.team_a_id}>{teamA?.name ?? 'Team A'}</option>
                                      ) : null}
                                      {match.team_b_id ? (
                                        <option value={match.team_b_id}>{teamB?.name ?? 'Team B'}</option>
                                      ) : null}
                                    </select>
                                  </div>
                                  <button type="submit" className="btn-primary w-full px-3 py-1.5 text-xs">
                                    Save result
                                  </button>
                                </form>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}

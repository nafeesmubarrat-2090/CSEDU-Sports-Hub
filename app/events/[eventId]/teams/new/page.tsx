import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventSummary = Pick<Database['public']['Tables']['events']['Row'], 'id' | 'name'>

type SearchParams = Promise<{
  error?: string
}>

type PageProps = {
  params: Promise<{
    eventId: string
  }>
  searchParams?: SearchParams
}

export default async function NewTeamPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const query = (await searchParams) ?? {}
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .maybeSingle()

  if (eventError) {
    throw new Error(eventError.message)
  }

  if (!event) {
    notFound()
  }

  async function createTeam(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const teamName = String(formData.get('name') ?? '').trim()

    if (!teamName) {
      redirect(`/events/${eventId}/teams/new?error=${encodeURIComponent('Team name is required')}`)
    }

    const { error } = await supabase.rpc('create_team_with_manager', {
      target_event: eventId,
      team_name: teamName,
    })

    if (error) {
      redirect(`/events/${eventId}/teams/new?error=${encodeURIComponent(error.message)}`)
    }

    redirect(`/events/${eventId}/teams`)
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 sm:px-8 lg:px-10">
      <p className="breadcrumb">
        <Link href={`/events/${eventId}`}>{event.name}</Link>
        {' / '}
        <span className="text-text">Create team</span>
      </p>
      <h1 className="mt-2 page-title">Create a team</h1>
      <p className="mt-2 text-sm text-muted">
        You will be added to the team immediately as its manager.
      </p>

      {query.error ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.error}
        </div>
      ) : null}

      <form action={createTeam} className="mt-8 card">
        <label htmlFor="name" className="label">
          Team name
        </label>
        <input
          id="name"
          name="name"
          required
          className="input mt-2"
          placeholder="E.g. Red Hawks"
        />

        <button type="submit" className="btn-primary mt-5">
          Create team
        </button>
      </form>
    </main>
  )
}
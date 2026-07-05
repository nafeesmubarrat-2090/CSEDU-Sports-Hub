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
      <p className="text-sm text-slate-500">
        <span className="hover:underline">{event.name}</span> / Create team
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Create a team</h1>
      <p className="mt-2 text-sm text-slate-600">
        You will be added to the team immediately as its manager.
      </p>

      {query.error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {query.error}
        </div>
      ) : null}

      <form action={createTeam} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label htmlFor="name" className="text-sm font-medium text-slate-700">
          Team name
        </label>
        <input
          id="name"
          name="name"
          required
          className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
          placeholder="E.g. Red Hawks"
        />

        <button
          type="submit"
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Create team
        </button>
      </form>
    </main>
  )
}
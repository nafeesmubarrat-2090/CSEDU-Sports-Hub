import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type SearchParams = Promise<{
  submitted?: string
  error?: string
}>

type EventInsert = Database['public']['Tables']['events']['Insert']

export default async function NewEventPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  async function createEvent(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const name = String(formData.get('name') ?? '').trim()
    const sport = String(formData.get('sport') ?? '').trim()
    const descriptionValue = String(formData.get('description') ?? '').trim()
    const startDate = String(formData.get('start_date') ?? '').trim()
    const endDate = String(formData.get('end_date') ?? '').trim()

    if (!name || !sport || !startDate || !endDate) {
      redirect('/events/new?error=Please+fill+out+all+required+fields')
    }

    const eventInput: EventInsert = {
      name,
      sport,
      description: descriptionValue || null,
      start_date: startDate,
      end_date: endDate,
      status: 'pending',
      created_by: user.id,
    }

    const { error } = await supabase.from('events').insert(eventInput)

    if (error) {
      redirect(`/events/new?error=${encodeURIComponent(error.message)}`)
    }

    redirect('/events/new?submitted=1')
  }

  const query = (await searchParams) ?? {}

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 sm:px-8 lg:px-10">
      <h1 className="text-3xl font-semibold text-slate-950">Propose an event</h1>
      <p className="mt-2 text-sm text-slate-600">
        Submit a proposal for admin review. Approved events become visible publicly.
      </p>

      {query.submitted ? (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Pending admin approval
        </div>
      ) : null}

      {query.error ? (
        <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {query.error}
        </div>
      ) : null}

      <form action={createEvent} className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label htmlFor="name" className="text-sm font-medium text-slate-700">
            Event name
          </label>
          <input
            id="name"
            name="name"
            required
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
          />
        </div>

        <div>
          <label htmlFor="sport" className="text-sm font-medium text-slate-700">
            Sport
          </label>
          <input
            id="sport"
            name="sport"
            required
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
          />
        </div>

        <div>
          <label htmlFor="description" className="text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="start_date" className="text-sm font-medium text-slate-700">
              Start date
            </label>
            <input
              id="start_date"
              name="start_date"
              type="date"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
            />
          </div>

          <div>
            <label htmlFor="end_date" className="text-sm font-medium text-slate-700">
              End date
            </label>
            <input
              id="end_date"
              name="end_date"
              type="date"
              required
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-900"
            />
          </div>
        </div>

        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          Submit proposal
        </button>
      </form>
    </main>
  )
}
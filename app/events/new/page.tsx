import { redirect } from 'next/navigation'
import Link from 'next/link'
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
      <p className="breadcrumb">
        <Link href="/events">Events</Link>
        {' / '}
        <span className="text-text">Propose</span>
      </p>
      <h1 className="mt-2 page-title">Propose an event</h1>
      <p className="mt-2 text-sm text-muted">
        Submit a proposal for admin review. Approved events become visible publicly.
      </p>

      {query.submitted ? (
        <div className="mt-6 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Pending admin approval
        </div>
      ) : null}

      {query.error ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.error}
        </div>
      ) : null}

      <form action={createEvent} className="mt-8 card space-y-5">
        <div>
          <label htmlFor="name" className="label">
            Event name
          </label>
          <input
            id="name"
            name="name"
            required
            className="input mt-2"
          />
        </div>

        <div>
          <label htmlFor="sport" className="label">
            Sport
          </label>
          <input
            id="sport"
            name="sport"
            required
            className="input mt-2"
          />
        </div>

        <div>
          <label htmlFor="description" className="label">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            className="input mt-2"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="start_date" className="label">
              Start date
            </label>
            <input
              id="start_date"
              name="start_date"
              type="date"
              required
              className="input mt-2"
            />
          </div>

          <div>
            <label htmlFor="end_date" className="label">
              End date
            </label>
            <input
              id="end_date"
              name="end_date"
              type="date"
              required
              className="input mt-2"
            />
          </div>
        </div>

        <button type="submit" className="btn-primary">
          Submit proposal
        </button>
      </form>
    </main>
  )
}
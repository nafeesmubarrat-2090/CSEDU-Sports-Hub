import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type BudgetEntry = Pick<
  Database['public']['Tables']['budget_entries']['Row'],
  'id' | 'event_id' | 'type' | 'label' | 'amount' | 'recorded_by' | 'proof_url' | 'created_at'
>

type ProfileSummary = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email'
>

type PageProps = {
  params: Promise<{ eventId: string }>
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export default async function BudgetPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event, error: eventError }, { data: entries, error: entriesError }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).maybeSingle(),
    supabase
      .from('budget_entries')
      .select('id, event_id, type, label, amount, recorded_by, proof_url, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true }),
  ])

  if (eventError) throw new Error(eventError.message)
  if (entriesError) throw new Error(entriesError.message)
  if (!event) return redirect('/events')

  const entryRows = (entries ?? []) as BudgetEntry[]

  const recorderIds = Array.from(new Set(entryRows.map((e) => e.recorded_by).filter(Boolean)))
  const { data: recorders = [], error: recordersError } = recorderIds.length
    ? await supabase.from('profiles').select('id, full_name, email').in('id', recorderIds)
    : { data: [] as ProfileSummary[], error: null }

  if (recordersError) throw new Error(recordersError.message)

  const recordersList = (recorders ?? []) as ProfileSummary[]
  const recorderMap = new Map(recordersList.map((r) => [r.id, r]))

  const totalIncome = entryRows.filter((e) => e.type === 'income').reduce((s, e) => s + Number(e.amount ?? 0), 0)
  const totalExpenses = entryRows.filter((e) => e.type === 'expense').reduce((s, e) => s + Number(e.amount ?? 0), 0)
  const net = totalIncome - totalExpenses

  // determine manager/admin for add-entry UI
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: currentProfile }] = await Promise.all([
    user
      ? supabase.from('profiles').select('id, full_name, email, global_role').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }) ,
  ])

  const isAdmin = currentProfile?.global_role === 'admin'
  // check if this user is an event manager for this event
  const { data: isEventManagerRows = [] } = user
    ? await supabase.from('event_managers').select('user_id').eq('event_id', eventId).eq('user_id', user.id)
    : { data: [] }

  const isEventManagerList = isEventManagerRows ?? []
  const canAdd = isAdmin || (isEventManagerList.length > 0)

  async function addEntry(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const type = String(formData.get('type') ?? 'expense')
    const label = String(formData.get('label') ?? '').trim()
    const amountRaw = String(formData.get('amount') ?? '0')
    const amount = parseFloat(amountRaw) || 0

    let proofUrl: string | null = null

    const proofFile = formData.get('proof') as File | null
    if (proofFile && proofFile.size > 0) {
      const filename = `${eventId}/${Date.now()}-${proofFile.name}`
      const { error: uploadError } = await supabase.storage.from('budget-proofs').upload(filename, proofFile)
      if (uploadError) {
        redirect(`/events/${eventId}/budget?error=${encodeURIComponent(uploadError.message)}`)
      }

      const { data: publicData } = supabase.storage.from('budget-proofs').getPublicUrl(filename)
      proofUrl = publicData?.publicUrl ?? null
    }

    const { error: insertError } = await supabase.from('budget_entries').insert({
      event_id: eventId,
      type: type as 'income' | 'expense',
      label,
      amount,
      recorded_by: user.id,
      proof_url: proofUrl,
    })

    if (insertError) {
      redirect(`/events/${eventId}/budget?error=${encodeURIComponent(insertError.message)}`)
    }

    redirect(`/events/${eventId}/budget?success=entry-added`)
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            <Link href={`/events/${eventId}`} className="hover:underline">
              {event.name}
            </Link>{' '}
            / Budget
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Budget ledger</h1>
        </div>
      </div>

      {/** Totals */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Total income</div>
          <div className="mt-2 text-xl font-semibold">{formatCurrency(totalIncome)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Total expenses</div>
          <div className="mt-2 text-xl font-semibold">{formatCurrency(totalExpenses)}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-sm text-slate-500">Net</div>
          <div className="mt-2 text-xl font-semibold">{formatCurrency(net)}</div>
        </div>
      </div>

      {canAdd ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add entry</h2>
          <p className="mt-1 text-sm text-slate-600">Add an income or expense. Proof upload is optional.</p>

          <form action={addEntry} encType="multipart/form-data" className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select name="type" className="rounded-lg border border-slate-300 px-3 py-2">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <input name="label" placeholder="Label" className="rounded-lg border border-slate-300 px-3 py-2" />
            <input name="amount" type="number" step="0.01" placeholder="Amount" className="rounded-lg border border-slate-300 px-3 py-2" />
            <input name="proof" type="file" className="col-span-1 sm:col-span-3" />
            <div className="col-span-1 sm:col-span-3">
              <button type="submit" className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">Add entry</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Entries</h2>

        <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Recorded by</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {entryRows.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-4 text-slate-700">{entry.type}</td>
                  <td className="px-4 py-4 text-slate-900">{entry.label}</td>
                  <td className="px-4 py-4 text-slate-700">{formatCurrency(Number(entry.amount ?? 0))}</td>
                  <td className="px-4 py-4 text-slate-700">{recorderMap.get(entry.recorded_by)?.full_name ?? entry.recorded_by}</td>
                  <td className="px-4 py-4 text-slate-700">{new Date(entry.created_at ?? '').toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-700">{entry.proof_url ? <a href={entry.proof_url} target="_blank" rel="noreferrer" className="text-sky-600">View</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

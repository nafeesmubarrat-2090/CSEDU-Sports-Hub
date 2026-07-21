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

type SearchParams = Promise<{
  error?: string
  success?: string
}>

type PageProps = {
  params: Promise<{ eventId: string }>
  searchParams?: SearchParams
}

function formatCurrency(value: number) {
  // Taka (৳) — the Intl BDT symbol renders inconsistently across runtimes, so we
  // format the number ourselves and prefix the sign.
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `৳${amount}`
}

export default async function BudgetPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const query = (await searchParams) ?? {}
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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: currentProfile } = user
    ? await supabase.from('profiles').select('id, full_name, email, global_role').eq('id', user.id).maybeSingle()
    : { data: null }

  const isAdmin = currentProfile?.global_role === 'admin'
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
    const amountRaw = String(formData.get('amount') ?? '').trim()

    if (!label || !amountRaw) {
      redirect(`/events/${eventId}/budget?error=${encodeURIComponent('Please fill out both the label and amount fields')}`)
    }

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
          <p className="breadcrumb">
            <Link href={`/events/${eventId}`}>{event.name}</Link>
            {' / '}
            <span className="text-text">Budget</span>
          </p>
          <h1 className="mt-2 page-title">Budget ledger</h1>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="label">Total income</div>
          <div className="mt-2 font-mono text-2xl font-bold text-success">{formatCurrency(totalIncome)}</div>
        </div>
        <div className="card">
          <div className="label">Total expenses</div>
          <div className="mt-2 font-mono text-2xl font-bold text-danger">{formatCurrency(totalExpenses)}</div>
        </div>
        <div className="card">
          <div className="label">Net</div>
          <div className={`mt-2 font-mono text-2xl font-bold ${net >= 0 ? 'text-primary' : 'text-danger'}`}>{formatCurrency(net)}</div>
        </div>
      </div>

      {query.error ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.error}
        </div>
      ) : null}

      {query.success ? (
        <div className="mt-6 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Entry added successfully
        </div>
      ) : null}

      {canAdd ? (
        <section className="mt-8 card">
          <h2 className="section-title">Add entry</h2>
          <p className="mt-1 text-sm text-muted">Add an income or expense. Proof upload is optional.</p>

          <form action={addEntry} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <select name="type" className="input">
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
            <input name="label" placeholder="Label" required className="input" />
            <input name="amount" type="number" step="0.01" placeholder="Amount" required className="input font-mono" />
            <input name="proof" type="file" className="col-span-1 sm:col-span-3 input p-2 file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-sm file:text-text" />
            <div className="col-span-1 sm:col-span-3">
              <button type="submit" className="btn-primary">Add entry</button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="mt-8 card">
        <h2 className="section-title">Entries</h2>

        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Label</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Recorded by</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Proof</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {entryRows.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-4">
                    <span className={entry.type === 'income' ? 'badge-approved' : 'badge-rejected'}>
                      {entry.type}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-text">{entry.label}</td>
                  <td className={`px-4 py-4 font-mono font-semibold ${entry.type === 'income' ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(Number(entry.amount ?? 0))}
                  </td>
                  <td className="px-4 py-4 text-muted">{recorderMap.get(entry.recorded_by)?.full_name ?? entry.recorded_by}</td>
                  <td className="px-4 py-4 font-mono text-muted">{new Date(entry.created_at ?? '').toLocaleString()}</td>
                  <td className="px-4 py-4 text-muted">{entry.proof_url ? <a href={entry.proof_url} target="_blank" rel="noreferrer" className="text-secondary hover:text-secondary-strong hover:underline">View</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
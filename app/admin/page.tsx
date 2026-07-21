import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'
import ConfirmButton from '@/components/ConfirmButton'

type EventRow = Pick<
  Database['public']['Tables']['events']['Row'],
  'id' | 'name' | 'sport' | 'created_by' | 'created_at' | 'status'
>

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'global_role'
>

type ManagedEvent = { id: string; name: string }

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const resolvedSearchParams = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: currentProfile }] = await Promise.all([
    user ? supabase.from('profiles').select('id, global_role').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
  ])

  if (currentProfile?.global_role !== 'admin') {
    return redirect('/events')
  }

  // pending events
  const { data: pending = [], error: pendingError } = await supabase
    .from('events')
    .select('id, name, sport, created_by, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (pendingError) throw new Error(pendingError.message)

  const pendingRows = (pending ?? []) as EventRow[]
  const creatorIds = Array.from(new Set(pendingRows.map((e) => e.created_by).filter(Boolean)))
  const { data: creators = [], error: creatorsError } = creatorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', creatorIds)
    : { data: [] as ProfileRow[], error: null }

  if (creatorsError) throw new Error(creatorsError.message)

  const creatorMap = new Map((creators ?? []).map((c: any) => [c.id, c.full_name]))

  // role management list (searchable)
  const q = typeof resolvedSearchParams.q === 'string' ? resolvedSearchParams.q : ''
  let profilesQuery = supabase.from('profiles').select('id, full_name, email, global_role').order('full_name')
  if (q && q.trim()) {
    const like = `%${q.replace(/%/g, '')}%`
    profilesQuery = profilesQuery.or(`full_name.ilike.%${like}%,email.ilike.%${like}%`)
  }

  const { data: allProfiles = [], error: profilesError } = await profilesQuery

  if (profilesError) throw new Error(profilesError.message)

  const profilesList = (allProfiles ?? []) as ProfileRow[]

  // approved events available for manager assignment
  const { data: approvedEventsData = [], error: approvedError } = await supabase
    .from('events')
    .select('id, name')
    .eq('status', 'approved')
    .order('name', { ascending: true })

  if (approvedError) throw new Error(approvedError.message)

  const approvedEvents = (approvedEventsData ?? []) as ManagedEvent[]

  // which events each user currently manages (creator of an approved event is
  // already here via approve_event(), so their proposed event shows up too)
  const { data: managerRows = [], error: managersError } = await supabase
    .from('event_managers')
    .select('user_id, event_id, events(id, name)')

  if (managersError) throw new Error(managersError.message)

  const managedByUser = new Map<string, ManagedEvent[]>()
  for (const row of (managerRows ?? []) as any[]) {
    const ev = row.events
    if (!ev) continue
    const list = managedByUser.get(row.user_id) ?? []
    list.push({ id: ev.id, name: ev.name })
    managedByUser.set(row.user_id, list)
  }

  // server actions
  async function approveEvent(formData: FormData) {
    'use server'
    const id = String(formData.get('eventId'))
    const supabase = await createClient()
    const { error } = await supabase.rpc('approve_event', { target_event: id })
    if (error) return redirect(`/admin?error=${encodeURIComponent(error.message)}`)
    return redirect('/admin')
  }

  async function rejectEvent(formData: FormData) {
    'use server'
    const id = String(formData.get('eventId'))
    const supabase = await createClient()
    const { error } = await supabase
      .from('events')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) return redirect(`/admin?error=${encodeURIComponent(error.message)}`)
    return redirect('/admin')
  }

  async function changeUserRole(formData: FormData) {
    'use server'
    const userId = String(formData.get('userId'))
    const newRole = String(formData.get('role'))
    const supabase = await createClient()
    const { error } = await supabase.rpc('change_user_role', { target_user: userId, new_role: newRole })
    if (error) return redirect(`/admin?roleError=${encodeURIComponent(error.message)}&target=${encodeURIComponent(userId)}`)
    return redirect('/admin')
  }

  async function assignEvents(formData: FormData) {
    'use server'
    const userId = String(formData.get('userId'))
    const eventIds = formData.getAll('eventIds').map(String).filter(Boolean)
    if (eventIds.length === 0) {
      return redirect(`/admin?roleError=${encodeURIComponent('Select at least one event to assign')}&target=${encodeURIComponent(userId)}`)
    }
    const supabase = await createClient()
    for (const eventId of eventIds) {
      const { error } = await supabase.rpc('add_event_manager', { target_event: eventId, target_user: userId })
      if (error) return redirect(`/admin?roleError=${encodeURIComponent(error.message)}&target=${encodeURIComponent(userId)}`)
    }
    return redirect('/admin')
  }

  async function removeEventManager(formData: FormData) {
    'use server'
    const userId = String(formData.get('userId'))
    const eventId = String(formData.get('eventId'))
    const supabase = await createClient()
    const { error } = await (supabase.rpc as any)('remove_event_manager', { target_event: eventId, target_user: userId })
    if (error) return redirect(`/admin?roleError=${encodeURIComponent(error.message)}&target=${encodeURIComponent(userId)}`)
    return redirect('/admin')
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="breadcrumb">
            <Link href="/events">Events</Link>
            {' / '}
            <span className="text-text">Admin</span>
          </p>
          <h1 className="mt-2 page-title">Admin dashboard</h1>
          <p className="mt-2 text-sm text-muted">Review pending events and manage user roles.</p>
        </div>
      </div>

      <section className="mt-8 card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Pending events queue</h2>
          <span className="font-mono text-sm text-muted">{pendingRows.length} pending</span>
        </div>
        {pendingRows.length === 0 ? (
          <div className="mt-4 empty-state">No pending events.</div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full table-fixed">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Event</th>
                  <th className="px-4 py-3 font-semibold">Sport</th>
                  <th className="px-4 py-3 font-semibold">Created by</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface text-sm">
                {pendingRows.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3 font-semibold text-text">{e.name}</td>
                    <td className="px-4 py-3 text-muted">{e.sport ?? '—'}</td>
                    <td className="px-4 py-3 text-muted">{creatorMap.get(e.created_by) ?? 'Unknown'}</td>
                    <td className="px-4 py-3 font-mono text-muted">{new Date(e.created_at ?? '').toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <form action={approveEvent}>
                          <input type="hidden" name="eventId" value={e.id} />
                          <button type="submit" className="btn-success">Approve</button>
                        </form>

                        <form action={rejectEvent}>
                          <input type="hidden" name="eventId" value={e.id} />
                          <button type="submit" className="btn-danger">Reject</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10 card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Role management</h2>
          <span className="font-mono text-sm text-muted">{profilesList.length} user{profilesList.length !== 1 ? 's' : ''}</span>
        </div>
        <p className="mt-1 text-sm text-muted">Search users, change their global role, and assign event managers to specific approved events. RPC errors are shown inline.</p>

        <div className="mt-4">
          <form method="get" action="/admin" className="mb-4 flex flex-col gap-2 sm:flex-row">
            <input name="q" defaultValue={q} placeholder="Search name or email" className="input" />
            <button type="submit" className="btn-secondary whitespace-nowrap">Search</button>
          </form>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Manages &amp; assignment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface text-sm">
                {profilesList.map((p) => {
                  const managed = managedByUser.get(p.id) ?? []
                  const managedIds = new Set(managed.map((m) => m.id))
                  const assignable = approvedEvents.filter((e) => !managedIds.has(e.id))
                  const isManager = p.global_role === 'event_manager' || p.global_role === 'admin'
                  const showError =
                    typeof resolvedSearchParams.roleError === 'string' &&
                    typeof resolvedSearchParams.target === 'string' &&
                    resolvedSearchParams.target === p.id
                  return (
                    <tr key={p.id} className="align-top">
                      <td className="px-4 py-3 font-semibold text-text">{p.full_name}</td>
                      <td className="px-4 py-3 text-muted">{p.email}</td>
                      <td className="px-4 py-3">
                        <span className={p.global_role === 'admin' ? 'badge-approved' : p.global_role === 'event_manager' ? 'badge-pending' : 'badge-neutral'}>
                          {p.global_role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-3">
                          <form action={changeUserRole} className="flex items-center gap-2">
                            <input type="hidden" name="userId" value={p.id} />
                            <select name="role" defaultValue={p.global_role} className="input py-1 text-sm">
                              <option value="admin">admin</option>
                              <option value="event_manager">event_manager</option>
                              <option value="user">user</option>
                            </select>
                            <button type="submit" className="btn-ghost">Change role</button>
                          </form>

                          {isManager ? (
                            <>
                              <div>
                                <p className="text-xs uppercase tracking-wide text-muted">Manages</p>
                                {managed.length === 0 ? (
                                  <p className="mt-1 text-sm text-muted">No events assigned yet.</p>
                                ) : (
                                  <ul className="mt-1 flex flex-wrap gap-2">
                                    {managed.map((m) => (
                                      <li key={m.id} className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1">
                                        <span className="text-sm text-text">{m.name}</span>
                                        <form action={removeEventManager} className="inline-flex">
                                          <input type="hidden" name="userId" value={p.id} />
                                          <input type="hidden" name="eventId" value={m.id} />
                                          <ConfirmButton
                                            message={`Remove ${p.full_name} as manager of "${m.name}"?`}
                                            className="text-danger hover:opacity-80"
                                          >
                                            ✕
                                          </ConfirmButton>
                                        </form>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {assignable.length > 0 ? (
                                <form action={assignEvents} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                  <input type="hidden" name="userId" value={p.id} />
                                  <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-muted">
                                    Assign to events (hold Ctrl/Cmd for multiple)
                                    <select name="eventIds" multiple size={Math.min(4, assignable.length)} className="input text-sm">
                                      {assignable.map((e) => (
                                        <option key={e.id} value={e.id}>{e.name}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <button type="submit" className="btn-secondary whitespace-nowrap">Assign</button>
                                </form>
                              ) : (
                                <p className="text-sm text-muted">All approved events already assigned.</p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-muted">Set role to event_manager to assign events.</p>
                          )}

                          {showError ? (
                            <div className="text-sm text-danger">{decodeURIComponent(resolvedSearchParams.roleError as string)}</div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

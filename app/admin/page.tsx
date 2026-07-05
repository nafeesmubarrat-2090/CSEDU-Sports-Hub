import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type EventRow = Pick<
  Database['public']['Tables']['events']['Row'],
  'id' | 'name' | 'sport' | 'created_by' | 'created_at' | 'status'
>

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'global_role'
>

export default async function AdminPage({ searchParams }: { searchParams?: Record<string, string> }) {
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
  const q = (searchParams?.q as string) ?? ''
  let profilesQuery = supabase.from('profiles').select('id, full_name, email, global_role').order('full_name')
  if (q && q.trim()) {
    const like = `%${q.replace(/%/g, '')}%`
    profilesQuery = profilesQuery.or(`full_name.ilike.%${like}%,email.ilike.%${like}%`)
  }

  const { data: allProfiles = [], error: profilesError } = await profilesQuery

  if (profilesError) throw new Error(profilesError.message)

  const profilesList = (allProfiles ?? []) as ProfileRow[]

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

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/events" className="hover:underline">
              Events
            </Link>{' '}
            / Admin
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">Admin dashboard</h1>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold text-slate-900">Pending events queue</h2>
        {pendingRows.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">No pending events.</div>
        ) : (
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Sport</th>
                  <th className="px-4 py-3">Created by</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {pendingRows.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-3">{e.name}</td>
                    <td className="px-4 py-3">{e.sport ?? '—'}</td>
                    <td className="px-4 py-3">{creatorMap.get(e.created_by) ?? 'Unknown'}</td>
                    <td className="px-4 py-3">{new Date(e.created_at ?? '').toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <form action={approveEvent}>
                          <input type="hidden" name="eventId" value={e.id} />
                          <button type="submit" className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white">Approve</button>
                        </form>

                        <form action={rejectEvent}>
                          <input type="hidden" name="eventId" value={e.id} />
                          <button type="submit" className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white">Reject</button>
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

      <section className="mt-10">
        <h2 className="text-lg font-semibold text-slate-900">Role management</h2>
        <p className="mt-1 text-sm text-slate-600">Search users and change their global role. RPC errors will be shown inline.</p>

        <div className="mt-4">
          <form method="get" action="/admin" className="mb-4 flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search name or email" className="w-full rounded-lg border border-slate-300 px-3 py-2" />
            <button type="submit" className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white">Search</button>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-fixed">
              <thead className="bg-slate-50 text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {profilesList.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">{p.full_name}</td>
                    <td className="px-4 py-3">{p.email}</td>
                    <td className="px-4 py-3">{p.global_role}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <form action={changeUserRole} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={p.id} />
                          <select name="role" defaultValue={p.global_role} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                            <option value="admin">admin</option>
                            <option value="event_manager">event_manager</option>
                            <option value="user">user</option>
                          </select>
                          <button type="submit" className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-medium text-white">Change</button>
                        </form>
                        {searchParams?.roleError && searchParams?.target === p.id ? (
                          <div className="text-rose-600 text-sm">{decodeURIComponent(searchParams.roleError)}</div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type AuditRow = Pick <
  Database['public']['Tables']['audit_log']['Row'],
  'id' | 'event_id' | 'action' | 'table_name' | 'created_at' | 'actor_id' | 'new_data' | 'old_data'
>

type ProfileSummary = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name'
>

type PageProps = {
  params: Promise<{ eventId: string }>
}

function formatActivity(action: string, tableName: string): string {
  if (action === 'INSERT' && tableName === 'team_members') return 'Added a player to the roster'
  if (action === 'DELETE' && tableName === 'team_members') return 'Removed a player from the roster'
  if (action === 'INSERT' && tableName === 'budget_entries') return 'Recorded a budget entry'
  if (action === 'INSERT' && tableName === 'events') return 'Created an event'
  if (action === 'UPDATE' && tableName === 'events') return 'Updated event details'
  if (action === 'APPROVE' && tableName === 'events') return 'Approved the event'
  if (action === 'ROLE_CHANGE' && tableName === 'profiles') return 'Changed a user role'
  if (action === 'ADD_EVENT_MANAGER' && tableName === 'event_managers') return 'Added an event manager'
  return `${action} — ${tableName}`
}

function relativeTime(dateString?: string | null) {
  if (!dateString) return ''
  const diff = Date.now() - new Date(dateString).getTime()
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? 's' : ''} ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days !== 1 ? 's' : ''} ago`
}

export default async function ActivityPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // fetch event existence and audit log
  const [{ data: event, error: eventError }, { data: audit, error: auditError }] = await Promise.all([
    supabase.from('events').select('id, name').eq('id', eventId).maybeSingle(),
    supabase
      .from('audit_log')
      .select('id, event_id, action, table_name, created_at, actor_id, new_data, old_data')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false }),
  ])
  
  if (eventError) throw new Error(eventError.message)
  if (auditError) throw new Error(auditError.message)
  if (!event) return redirect('/events')

  const auditRows = (audit ?? []) as unknown as AuditRow[]
  const actorIds = Array.from(new Set(auditRows.map((r) => (r as any).actor_id).filter(Boolean)))

  const { data: actors = [], error: actorsError } = actorIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', actorIds)
    : { data: [] as ProfileSummary[], error: null }

  if (actorsError) throw new Error(actorsError.message)

  const userMap = new Map((actors ?? []).map((u) => [u.id, u]))

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 lg:px-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="breadcrumb">
            <Link href={`/events/${eventId}`}>{event.name}</Link>
            {' / '}
            <span className="text-text">Activity</span>
          </p>
          <h1 className="mt-2 page-title">Activity log</h1>
          <p className="mt-2 text-sm text-muted">Audit trail of changes made to this event.</p>
        </div>
      </div>

      <section className="mt-8 card">
        <div className="flex items-center justify-between">
          <h2 className="section-title">Recent activity</h2>
          <span className="font-mono text-sm text-muted">{auditRows.length} event{auditRows.length !== 1 ? 's' : ''}</span>
        </div>

        {auditRows.length === 0 ? (
          <div className="mt-4 empty-state">No activity yet.</div>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {auditRows.map((row) => (
              <li key={row.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary shadow-[0_0_8px_rgba(242,183,5,0.6)]" />
                    <div>
                      <div className="text-sm font-semibold text-text">{userMap.get((row as any).actor_id ?? (row as any).actor_id)?.full_name ?? 'Unknown'}</div>
                      <div className="mt-1 text-sm text-muted">{formatActivity(row.action, row.table_name)}</div>
                    </div>
                  </div>
                  <div className="font-mono text-xs text-muted">{relativeTime(row.created_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

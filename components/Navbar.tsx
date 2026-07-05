import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'
import NavbarSignOut from './NavbarSignOut'

async function getSession() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, global_role, avatar_url')
    .eq('id', user.id)
    .maybeSingle()

  return { user, profile }
}

export default async function Navbar() {
  const session = await getSession()
  const isAdmin = session?.profile?.global_role === 'admin'

  return (
    <header className="border-b border-slate-200 bg-white/90 px-6 py-4 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <Link href="/" className="text-lg font-semibold text-slate-950">
          CSE DU Sports
        </Link>

        <nav className="flex items-center gap-4 text-sm text-slate-700">
          <Link href="/events" className="hover:text-slate-950">
            Events
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="hover:text-slate-950">
                Dashboard
              </Link>
              {isAdmin ? (
                <Link href="/admin" className="hover:text-slate-950">
                  Admin
                </Link>
              ) : null}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {session.profile?.full_name ?? session.user.email}
              </span>
              <NavbarSignOut />
            </>
          ) : (
            <Link href="/login" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}

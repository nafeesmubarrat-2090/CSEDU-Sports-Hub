import Link from 'next/link'
import { getCurrentSession } from '@/lib/supabase/auth'
import NavbarSignOut from './NavbarSignOut'
import GoogleSignInButton from './GoogleSignInButton'

export default async function Navbar() {
  const session = await getCurrentSession()
  const isAdmin = session?.isAdmin ?? false

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 text-text">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/40 bg-primary/10 font-display text-lg font-extrabold text-primary shadow-[var(--shadow-glow-amber)]">
            C
          </span>
          <span>
            <span className="block font-display text-lg font-extrabold uppercase tracking-tight leading-none">CSE DU Sports</span>
            <span className="block text-xs font-medium uppercase tracking-widest text-muted">Event management hub</span>
          </span>
        </Link>

        <nav className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Link href="/events" className="rounded-lg px-3 py-2 font-medium uppercase tracking-wide transition hover:bg-surface-2 hover:text-primary">
            Events
          </Link>
          {session ? (
            <>
              <Link href="/dashboard" className="rounded-lg px-3 py-2 font-medium uppercase tracking-wide transition hover:bg-surface-2 hover:text-primary">
                Dashboard
              </Link>
              {isAdmin ? (
                <Link href="/admin" className="rounded-lg px-3 py-2 font-medium uppercase tracking-wide transition hover:bg-surface-2 hover:text-primary">
                  Admin
                </Link>
              ) : null}
              <Link
                href="/profile"
                className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-text transition hover:border-primary/40 hover:text-primary"
              >
                {session.profile?.full_name ?? session.user.email}
              </Link>
              <NavbarSignOut />
            </>
          ) : (
            <GoogleSignInButton className="btn-primary" label="Sign in" />
          )}
        </nav>
      </div>
    </header>
  )
}
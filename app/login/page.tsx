'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    setError(null)

    const supabase = createClient()
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', '/dashboard')

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-80px)] items-center justify-center bg-transparent px-4 py-16 sm:px-6 lg:px-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-card)] lg:grid-cols-[1.1fr_0.9fr]">
        <div className="p-8 sm:p-10 lg:p-12">
          <div className="inline-flex items-center rounded-full border border-secondary/30 bg-secondary-soft px-3 py-1 text-xs font-semibold uppercase tracking-widest text-secondary">
            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-secondary" />
            Secure sign-in
          </div>
          <h1 className="mt-5 font-display text-3xl font-extrabold uppercase tracking-tight text-text">Welcome back</h1>
          <p className="mt-3 max-w-lg text-sm leading-7 text-muted">
            Continue with Google to access your dashboard, coordinate team activity, and manage departmental events.
          </p>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="mt-8 btn-primary w-full sm:w-auto"
          >
            {isLoading ? 'Redirecting...' : 'Continue with Google'}
          </button>

          {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        </div>

        <div className="border-t border-border bg-bg p-8 sm:p-10 lg:border-l lg:border-t-0 lg:p-12">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Why it feels effortless</p>
          <ul className="mt-6 space-y-3 text-sm text-text">
            {[
              'Create, review, and publish events in one flow.',
              'Stay up to date with teams, results, and activity logs.',
              'Move from planning to execution without context switching.',
            ].map((item) => (
              <li key={item} className="rounded-lg border border-border bg-surface-2 px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  )
}
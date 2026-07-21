'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function GoogleSignInButton({
  className = 'btn-primary',
  label = 'Sign in',
}: {
  className?: string
  label?: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleSignIn() {
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
    <>
      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className={className}
      >
        {isLoading ? 'Redirecting...' : label}
      </button>
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </>
  )
}

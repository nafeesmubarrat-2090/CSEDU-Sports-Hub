'use client'

import { useEffect, useRef, useState } from 'react'
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
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    function handleReturn() {
      setIsLoading(false)
    }

    window.addEventListener('pageshow', handleReturn)
    window.addEventListener('focus', handleReturn)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleReturn()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pageshow', handleReturn)
      window.removeEventListener('focus', handleReturn)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  async function handleGoogleSignIn() {
    setIsLoading(true)
    setError(null)

    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      setIsLoading(false)
    }, 6000)

    try {
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
        if (timerRef.current) window.clearTimeout(timerRef.current)
        setError(error.message)
        setIsLoading(false)
      }
    } catch (err: unknown) {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      setError(err instanceof Error ? err.message : 'Sign in failed')
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

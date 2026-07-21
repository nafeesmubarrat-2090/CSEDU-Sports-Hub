'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function NavbarSignOut() {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="btn-ghost"
    >
      Sign out
    </button>
  )
}

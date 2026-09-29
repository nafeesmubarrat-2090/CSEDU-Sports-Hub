'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type RealtimeBracketListenerProps = {
  eventId: string
}

export default function RealtimeBracketListener({ eventId }: RealtimeBracketListenerProps) {
  const router = useRouter()
  const [isLive, setIsLive] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`bracket-matches-${eventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          // Re-fetch server component data seamlessly in the background
          router.refresh()
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setIsLive(true)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [eventId, router])

  if (!isLive) return null

  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-success shadow-[0_0_8px_rgba(52,211,153,0.3)]">
      <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
      <span>Live updates active</span>
    </div>
  )
}

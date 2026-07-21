import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')
  const safeNext = next?.startsWith('/') ? next : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      console.log('Auth callback: session established for user', data.user?.id)
      return NextResponse.redirect(new URL(safeNext, requestUrl.origin))
    }
    console.error('Auth callback: code exchange failed:', error.message)
  }

  return NextResponse.redirect(new URL('/login', requestUrl.origin))
}
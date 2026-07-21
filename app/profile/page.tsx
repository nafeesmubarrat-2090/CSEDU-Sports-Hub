import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/types/database.types'

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'id' | 'full_name' | 'email' | 'avatar_url' | 'username'
>

type SearchParams = Promise<{
  error?: string
  success?: string
}>

type PageProps = {
  searchParams?: SearchParams
}

function Avatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
    )
  }

  return <span>{name.slice(0, 2).toUpperCase()}</span>
}

export default async function ProfilePage({ searchParams }: PageProps) {
  const query = (await searchParams) ?? {}
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, username')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(profileError.message)
  }

  if (!profile) {
    redirect('/login')
  }

  const currentProfile = profile as ProfileRow

  async function updateProfile(formData: FormData) {
    'use server'

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      redirect('/login')
    }

    const username = String(formData.get('username') ?? '').trim()
    const fullName = String(formData.get('full_name') ?? '').trim()

    if (!fullName) {
      redirect(`/profile?error=${encodeURIComponent('Display name cannot be empty')}`)
    }

    // Username changes go through the RPC so format/uniqueness are enforced with
    // friendly errors; direct column UPDATE on username is revoked.
    const { error: usernameError } = await supabase.rpc('set_username', { new_username: username })

    if (usernameError) {
      redirect(`/profile?error=${encodeURIComponent(usernameError.message)}`)
    }

    const { error: nameError } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', user.id)

    if (nameError) {
      redirect(`/profile?error=${encodeURIComponent(nameError.message)}`)
    }

    redirect('/profile?success=saved')
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12 sm:px-8 lg:px-10">
      <div>
        <p className="breadcrumb">
          <span className="text-text">Profile</span>
        </p>
        <h1 className="mt-2 page-title">Your profile</h1>
        <p className="mt-2 text-sm text-muted">
          Update your display name and username. Your username is public and must be unique.
        </p>
      </div>

      {query.error ? (
        <div className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {query.error}
        </div>
      ) : null}

      {query.success ? (
        <div className="mt-6 rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-sm text-success">
          Profile updated.
        </div>
      ) : null}

      <section className="mt-8 card">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 font-display text-base font-bold uppercase text-primary">
            <Avatar name={currentProfile.full_name} avatarUrl={currentProfile.avatar_url} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-text">{currentProfile.full_name}</p>
            <p className="text-sm text-muted">{currentProfile.email}</p>
          </div>
        </div>

        <form action={updateProfile} className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="full_name" className="text-sm font-medium text-text">
              Display name
            </label>
            <input
              id="full_name"
              type="text"
              name="full_name"
              defaultValue={currentProfile.full_name}
              className="input"
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-sm font-medium text-text">
              Username
            </label>
            <input
              id="username"
              type="text"
              name="username"
              defaultValue={currentProfile.username}
              placeholder="your_handle"
              pattern="[A-Za-z0-9_.]{3,30}"
              title="3-30 characters using only letters, numbers, dots, and underscores"
              className="input"
              required
            />
            <p className="text-xs text-muted">
              3–30 characters: letters, numbers, dots, and underscores. Not case-sensitive.
            </p>
          </div>

          <div>
            <button type="submit" className="btn-primary">
              Save changes
            </button>
          </div>
        </form>

        <div className="mt-6 border-t border-border pt-4">
          <p className="text-sm text-muted">
            Email is managed by your Google sign-in and can’t be changed here.
          </p>
        </div>
      </section>
    </main>
  )
}

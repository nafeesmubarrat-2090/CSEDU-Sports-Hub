export default function EventDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-8 lg:px-10 animate-pulse">
      <div className="h-4 w-32 rounded bg-surface-2" />

      {/* Hero skeleton */}
      <section className="event-hero mt-3 p-8 rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2">
          <div className="h-6 w-20 rounded-full bg-surface-2" />
          <div className="h-6 w-24 rounded-full bg-surface-2" />
        </div>
        <div className="mt-4 h-10 w-3/4 max-w-md rounded-lg bg-surface-2" />
        <div className="mt-2 h-4 w-28 rounded bg-surface-2" />

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4 border-t border-border pt-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-16 rounded bg-surface-2" />
              <div className="h-5 w-20 rounded bg-surface-2" />
            </div>
          ))}
        </div>
      </section>

      {/* Tabs skeleton */}
      <div className="mt-6 flex flex-wrap gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-9 w-24 rounded-lg bg-surface-2" />
        ))}
      </div>

      {/* Details skeleton */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="card h-40 rounded-lg bg-surface p-6" />
        <div className="card h-40 rounded-lg bg-surface p-6" />
      </div>
    </main>
  )
}

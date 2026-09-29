export default function EventsLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="h-10 w-48 rounded-lg bg-surface-2" />
          <div className="mt-3 h-4 w-80 max-w-full rounded bg-surface-2" />
        </div>
        <div className="h-10 w-36 rounded-lg bg-surface-2" />
      </div>

      <div className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-6 w-36 rounded bg-surface-2" />
          <div className="h-4 w-16 rounded bg-surface-2" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-6 w-40 rounded bg-surface-2" />
                  <div className="h-4 w-24 rounded bg-surface-2" />
                </div>
                <div className="h-6 w-20 rounded-full bg-surface-2" />
              </div>
              <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
                <div className="space-y-1">
                  <div className="h-3 w-12 rounded bg-surface-2" />
                  <div className="h-4 w-16 rounded bg-surface-2" />
                </div>
                <div className="space-y-1">
                  <div className="h-3 w-12 rounded bg-surface-2" />
                  <div className="h-4 w-16 rounded bg-surface-2" />
                </div>
                <div className="space-y-1">
                  <div className="h-3 w-12 rounded bg-surface-2" />
                  <div className="h-4 w-16 rounded bg-surface-2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

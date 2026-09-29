export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10 animate-pulse">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-9 w-44 rounded-lg bg-surface-2" />
          <div className="h-4 w-72 rounded bg-surface-2" />
        </div>
        <div className="flex gap-3">
          <div className="h-10 w-28 rounded-lg bg-surface-2" />
          <div className="h-10 w-32 rounded-lg bg-surface-2" />
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <div className="h-6 w-44 rounded bg-surface-2" />
          <div className="h-4 w-16 rounded bg-surface-2" />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="h-5 w-36 rounded bg-surface-2" />
                  <div className="h-3 w-20 rounded bg-surface-2" />
                </div>
                <div className="h-5 w-16 rounded-full bg-surface-2" />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
                <div className="h-8 rounded bg-surface-2" />
                <div className="h-8 rounded bg-surface-2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}

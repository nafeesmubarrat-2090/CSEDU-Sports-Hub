export default function BudgetLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10 animate-pulse">
      <div>
        <div className="h-4 w-40 rounded bg-surface-2" />
        <div className="mt-2 h-9 w-52 rounded-lg bg-surface-2" />
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="card p-5 space-y-2">
            <div className="h-4 w-24 rounded bg-surface-2" />
            <div className="h-8 w-36 rounded bg-surface-2" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="mt-8 card p-6">
        <div className="h-6 w-32 rounded bg-surface-2" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 w-full rounded bg-surface-2" />
          ))}
        </div>
      </div>
    </main>
  )
}

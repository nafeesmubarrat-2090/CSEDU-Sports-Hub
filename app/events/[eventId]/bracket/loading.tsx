export default function BracketLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-12 sm:px-8 lg:px-10 animate-pulse">
      <div>
        <div className="h-4 w-40 rounded bg-surface-2" />
        <div className="mt-2 h-9 w-60 rounded-lg bg-surface-2" />
        <div className="mt-2 h-4 w-72 rounded bg-surface-2" />
      </div>

      {/* Bracket rounds skeleton */}
      <div className="mt-10 overflow-x-auto pb-6">
        <div className="flex gap-8 min-w-[700px]">
          {[1, 2, 3].map((round) => (
            <div key={round} className="flex-1 space-y-6">
              <div className="h-6 w-28 rounded bg-surface-2 mx-auto" />
              <div className="space-y-4">
                {[1, 2].map((match) => (
                  <div key={match} className="card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="h-4 w-28 rounded bg-surface-2" />
                      <div className="h-4 w-8 rounded bg-surface-2" />
                    </div>
                    <div className="border-t border-border/50 pt-2 flex items-center justify-between">
                      <div className="h-4 w-28 rounded bg-surface-2" />
                      <div className="h-4 w-8 rounded bg-surface-2" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}

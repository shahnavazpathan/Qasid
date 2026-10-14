export function SkeletonCards({ count = 6 }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card p-5 animate-pulse">
          <div className="flex gap-3">
            <div className="size-11 rounded-2xl bg-raised" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 rounded bg-raised w-3/4" />
              <div className="h-3 rounded bg-raised w-1/3" />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[0, 1, 2].map(j => <div key={j} className="h-10 rounded-xl bg-raised" />)}
          </div>
          <div className="mt-4 h-2 rounded-full bg-raised" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-14 rounded-2xl bg-raised animate-pulse" />)}
    </div>
  );
}

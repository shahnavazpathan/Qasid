export function SkeletonRows({ rows = 6 }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="py-5 flex items-center gap-6 animate-pulse">
          <div className="h-4 rounded bg-raised" style={{ width: `${40 - (i % 3) * 8}%` }} />
          <div className="ml-auto h-4 w-20 rounded bg-raised" />
        </div>
      ))}
    </div>
  );
}

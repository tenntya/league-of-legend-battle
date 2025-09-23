export function SkeletonLine({ width = "100%", height = 14 }: { width?: number | string; height?: number }) {
  return <div className="skeleton" style={{ width, height, borderRadius: 8 }} />;
}

export function SkeletonBlock({ height = 160 }: { height?: number }) {
  return <div className="skeleton w-full" style={{ height, borderRadius: 12 }} />;
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-neutral-900/60 backdrop-blur-sm shadow-lg p-4 space-y-2">
      <SkeletonLine width={120} height={12} />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} />
      ))}
    </section>
  );
}

export function ChartSkeleton() {
  return (
    <section className="rounded-2xl border border-white/10 bg-neutral-900/60 backdrop-blur-sm shadow-lg p-4">
      <SkeletonLine width={140} height={12} />
      <div className="mt-2">
        <SkeletonBlock height={260} />
      </div>
    </section>
  );
}

export function ListSkeleton({ items = 8 }: { items?: number }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-neutral-900/60 backdrop-blur-sm shadow-lg p-4">
      <SkeletonLine width={120} height={12} />
      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
            <div className="flex-1 space-y-2">
              <SkeletonLine width={100} />
              <SkeletonLine width={80} height={12} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}


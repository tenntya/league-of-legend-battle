export default function MetaKPI({ meta, bestLane }: { meta: { riotId: string; totalGames: number; generatedAt: string; cluster: string }, bestLane: string }) {
  const items = [
    { label: "Riot ID", value: meta.riotId },
    { label: "総試合数", value: meta.totalGames.toLocaleString() },
    { label: "得意レーン", value: bestLane || "-" },
    { label: "生成日時", value: new Date(meta.generatedAt).toLocaleString() },
    { label: "リージョン", value: String(meta.cluster).toUpperCase() },
  ];
  return (
    <section className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
      {items.map((it) => (
        <div key={it.label} className="rounded-xl ring-1 ring-white/10 bg-neutral-950/60 p-4">
          <div className="text-label text-neutral-400 mb-1 uppercase tracking-wide">{it.label}</div>
          <div className="text-h3 font-semibold text-neutral-100 truncate">{it.value}</div>
        </div>
      ))}
    </section>
  );
}

export default function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="relative rounded-2xl border border-white/10 bg-neutral-900/60 backdrop-blur-sm shadow-lg p-4">
      <h2 className="text-xs tracking-wide text-neutral-400 mb-2 uppercase">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

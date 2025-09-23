export default function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="relative rounded-2xl ring-1 ring-white/10 bg-neutral-900/70 backdrop-blur-md shadow-lg p-5 transition-colors hover:ring-white/15">
      <h2 className="text-label tracking-wide text-neutral-400 mb-2 uppercase">{title}</h2>
      <div>{children}</div>
    </section>
  );
}

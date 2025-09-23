export default function Footer() {
  return (
    <footer className="mt-10 border-t border-white/10">
      <div className="max-w-6xl mx-auto px-6 py-6 text-label text-neutral-400 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} LoL 年間サマリー（NoDB）</p>
        <p>
          データは Riot API を利用しています。レート制限・ポリシー遵守にご協力ください。
        </p>
      </div>
    </footer>
  );
}

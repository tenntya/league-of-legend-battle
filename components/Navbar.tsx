"use client";
export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-neutral-900/40 bg-neutral-900/60 border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 min-h-12 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-small font-medium tracking-tight">
          <span className="bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">LoL 年間サマリー</span>
          <span className="ml-2 text-neutral-400">(NoDB)</span>
        </div>
        <nav className="flex items-center gap-3 text-small">
          <a className="text-neutral-300 hover:text-white transition-soft" href="https://www.riotgames.com/" target="_blank" rel="noreferrer">Riot</a>
          <button className="text-neutral-300 hover:text-white transition-soft" onClick={(e)=>{e.preventDefault();}}>About</button>
        </nav>
      </div>
    </header>
  );
}

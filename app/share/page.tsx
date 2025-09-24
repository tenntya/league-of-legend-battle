import { Metadata } from "next";
import { headers } from "next/headers";

type Props = { searchParams: { [k: string]: string | string[] | undefined } };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const riotId = (searchParams.riotId as string) || "Riot ID";
  const year = (searchParams.year as string) || String(new Date().getFullYear());
  const bestLane = (searchParams.bestLane as string) || "-";
  const top = (searchParams.top as string) || ""; // format: name:games:wr,name:games:wr
  const v = (searchParams.v as string) || ""; // cache buster for X

  const title = `${riotId} / ${year} のサマリー`;
  const description = `Best Lane: ${bestLane} — 使用数・勝率・得意レーンをさくっと可視化`;
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = (h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https"));
  const base = `${proto}://${host}`;
  const ogStatic = new URL("/og-default.png", base);
  const topName = top ? (top.split(",")[0]?.split(":")[0] || "").trim() : "";
  function toDdragonKey(name: string): string | null {
    if (!name) return null;
    const specials: Record<string, string> = {
      "Wukong": "MonkeyKing",
      "Monkey King": "MonkeyKing",
      "Cho'Gath": "Chogath",
      "Kha'Zix": "Khazix",
      "Kai'Sa": "KaiSa",
      "Vel'Koz": "Velkoz",
      "LeBlanc": "Leblanc",
      "Dr. Mundo": "DrMundo",
      "Miss Fortune": "MissFortune",
      "Master Yi": "MasterYi",
      "Jarvan IV": "JarvanIV",
      "Twisted Fate": "TwistedFate",
      "Xin Zhao": "XinZhao",
      "Renata Glasc": "Renata",
      "Nunu & Willump": "Nunu",
      "Tahm Kench": "TahmKench",
      "Rek'Sai": "RekSai",
      "Bel'Veth": "Belveth",
    };
    if (specials[name]) return specials[name];
    // Normalize: remove spaces and punctuation commonly used
    const norm = name
      .replace(/['\s\.]/g, "")
      .replace(/&/g, "")
      .replace(/:/g, "")
      .replace(/é/g, "e");
    return norm || null;
  }
  const ddKey = toDdragonKey(topName || "");
  const ddSplash = ddKey ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${ddKey}_0.jpg${v ? `?v=${encodeURIComponent(v)}` : ""}` : null;

  return {
    title,
    description,
    openGraph: {
      url: `${base}/share?riotId=${encodeURIComponent(riotId)}&year=${encodeURIComponent(year)}${bestLane ? `&bestLane=${encodeURIComponent(bestLane)}` : ""}${top ? `&top=${encodeURIComponent(top)}` : ""}`,
      title,
      description,
      images: [ddSplash || (v ? `${ogStatic.toString()}?v=${encodeURIComponent(v)}` : ogStatic.toString())],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ddSplash || (v ? `${ogStatic.toString()}?v=${encodeURIComponent(v)}` : ogStatic.toString())],
    },
  };
}

export default function SharePage({ searchParams }: Props) {
  const riotId = (searchParams.riotId as string) || "Riot ID";
  const year = (searchParams.year as string) || String(new Date().getFullYear());
  const bestLane = (searchParams.bestLane as string) || "-";
  const top = (searchParams.top as string) || "";
  const topItems = top
    ? top.split(",").map((s) => {
        const [name, games, wr] = s.split(":");
        return { name, games, wr };
      })
    : [] as { name: string; games: string; wr: string }[];
  // derive ddKey here as well to use in client render
  const specials: Record<string, string> = {
    "Wukong": "MonkeyKing",
    "Monkey King": "MonkeyKing",
    "Cho'Gath": "Chogath",
    "Kha'Zix": "Khazix",
    "Kai'Sa": "KaiSa",
    "Vel'Koz": "Velkoz",
    "LeBlanc": "Leblanc",
    "Dr. Mundo": "DrMundo",
    "Miss Fortune": "MissFortune",
    "Master Yi": "MasterYi",
    "Jarvan IV": "JarvanIV",
    "Twisted Fate": "TwistedFate",
    "Xin Zhao": "XinZhao",
    "Renata Glasc": "Renata",
    "Nunu & Willump": "Nunu",
    "Tahm Kench": "TahmKench",
    "Rek'Sai": "RekSai",
    "Bel'Veth": "Belveth",
  };
  const topName = topItems[0]?.name || "";
  const ddKey = topName ? (specials[topName] || topName.replace(/['\s\.]/g, "").replace(/&/g, "").replace(/:/g, "").replace(/é/g, "e")) : null;

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-h2 font-semibold">共有プレビュー</h1>
      <p className="text-neutral-400 text-small mt-2">このページのOG画像がSNSでのサムネイルとして表示されます。</p>
      <div className="mt-4 space-y-3">
        <div className="rounded-2xl ring-1 ring-white/10 bg-neutral-900/70 p-4">
          <div className="text-sm text-neutral-300">{riotId} / {year}</div>
          <div className="text-sm text-neutral-500">Best Lane: {bestLane}</div>
          {topItems.length > 0 && (
            <div className="text-sm text-neutral-400 mt-2">
              TOP3: {topItems.map((t, i) => `${i+1}.${t.name} ${t.games}G ${t.wr}%`).join("  ")}
            </div>
          )}
        </div>
        <div>
          <div className="text-label text-neutral-400 mb-2">OG画像（RIOT公式/代替）</div>
          <img
            src={(ddKey ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${ddKey}_0.jpg${(searchParams.v as string) ? `?v=${encodeURIComponent(searchParams.v as string)}` : ""}` : ((searchParams.v as string) ? `/og-default.png?v=${encodeURIComponent(searchParams.v as string)}` : "/og-default.png"))}
            alt="OG Preview"
            width={1200}
            height={630}
            className="w-full h-auto rounded-xl ring-1 ring-white/10"
          />
          <div className="text-xs text-neutral-500 mt-2">※ Top1チャンプのスプラッシュ（なければ静的PNG）</div>
        </div>
      </div>
    </main>
  );
}

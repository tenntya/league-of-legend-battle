"use client";
import { useMemo, useRef, useState } from "react";
import Card from "@/components/Card";
import { Bar, Doughnut } from "react-chartjs-2";
import { CardSkeleton, ChartSkeleton, ListSkeleton } from "@/components/Skeleton";
import ShareButtons from "@/components/ShareButtons";
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from "chart.js";
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
// ダーク背景でも視認できるようにデフォルトカラーを調整
ChartJS.defaults.color = "#e5e7eb"; // tailwind neutral-200
ChartJS.defaults.borderColor = "rgba(255,255,255,0.08)";

type Champ = { name: string; games: number; wins: number; winRate: number; icon: string };
type Lane = { lane: string; games: number; wins: number; winRate: number };
type Cluster = "americas" | "asia" | "europe";
type Api = {
  meta: { riotId: string; totalGames: number; year: number; cluster: string; queues: number[]; generatedAt: string };
  champions: Champ[];
  lanes: Lane[];
  topUsed: Champ[];
  topWinRate: Champ[];
  bestLane: string;
  insights?: { summary: string; bullets: string[] };
};

export default function Page() {
  const now = new Date();
  const [riotId, setRiotId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [queues, setQueues] = useState<string>("420,440");
  const [cluster, setCluster] = useState<Cluster>("asia"); // 既定を JP/KR の Asia に
  const [preset, setPreset] = useState<"ranked" | "normal" | "aram" | "all" | "custom">("ranked");
  const [limit, setLimit] = useState<number>(300);
  const [data, setData] = useState<Api | null>(null);
  const [partial, setPartial] = useState<Partial<Api> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [streaming, setStreaming] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const years = useMemo(() => Array.from({ length: 6 }, (_, i) => now.getFullYear() - i), [now]);

  function applyPreset(p: typeof preset) {
    setPreset(p);
    if (p === "ranked") setQueues("420,440");
    else if (p === "normal") setQueues("400,430,490");
    else if (p === "aram") setQueues("450");
    else if (p === "all") setQueues("");
  }

  async function run() {
    setLoading(true);
    setError(null);
    setData(null);
    setPartial(null);
    setProgress(null);
    try {
      const u = new URL(streaming ? "/api/stats/stream" : "/api/stats", window.location.origin);
      u.searchParams.set("riotId", riotId.trim());
      u.searchParams.set("year", String(year));
      u.searchParams.set("queues", queues);
      u.searchParams.set("cluster", cluster);
      u.searchParams.set("limit", String(limit));
      if (streaming) {
        if (esRef.current) { esRef.current.close(); esRef.current = null; }
        const es = new EventSource(u.toString());
        esRef.current = es;
        es.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === "meta") {
              setPartial((p) => ({ ...(p || {}), meta: { ...(msg.meta || {}), totalGames: 0, generatedAt: new Date().toISOString() } as any }));
            } else if (msg.type === "ids") {
              setProgress({ done: 0, total: msg.total });
            } else if (msg.type === "progress") {
              setProgress({ done: msg.processed, total: msg.total });
              setPartial((p) => ({ ...(p || {}), topUsed: msg.snapshot.topWinRate ? msg.snapshot.topUsed : msg.snapshot.champions, lanes: msg.snapshot.lanes } as any));
            } else if (msg.type === "done") {
              setData(msg.result);
              setLoading(false);
              es.close(); esRef.current = null;
            } else if (msg.type === "error") {
              setError(String(msg.error || "failed"));
              setLoading(false);
              es.close(); esRef.current = null;
            }
          } catch {}
        };
        es.onerror = () => {
          setError("stream_error");
          setLoading(false);
          es.close(); esRef.current = null;
        };
      } else {
        const res = await fetch(u.toString(), { cache: "no-store" });
        if (!res.ok) throw new Error((await res.json()).error || "failed");
        setData(await res.json());
      }
    } catch (e: any) {
      setError(e?.message || "failed");
    } finally {
      if (!streaming) setLoading(false);
    }
  }

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-r from-white to-neutral-400 bg-clip-text text-transparent">LoL 年間サマリー（NoDB / Vercel）</h1>
        <p className="text-neutral-400 text-sm">Riot ID から今年の「使用数・勝率・得意レーン」を即席集計</p>
      </header>

      <Card title="検索">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
          <div className="flex-1">
            <label className="text-xs text-neutral-400">Riot ID（例: Taro#JP1）</label>
            <input
              value={riotId}
              onChange={(e) => setRiotId(e.target.value)}
              placeholder="GameName#TagLine"
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-neutral-400">地域</label>
            <select
              value={cluster}
              onChange={(e) => setCluster(e.target.value as Cluster)}
              className="rounded-xl bg-neutral-950 border border-neutral-800 p-2"
            >
              <option value="asia">JP / KR（Asia）</option>
              <option value="americas">NA / BR / LAN / LAS / OCE（Americas）</option>
              <option value="europe">EUW / EUNE / TR / RU（Europe）</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-400">年</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-xl bg-neutral-950 border border-neutral-800 p-2"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-400">対象試合数（上限）</label>
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="rounded-xl bg-neutral-950 border border-neutral-800 p-2"
            >
              <option value={100}>直近 100</option>
              <option value={300}>直近 300</option>
              <option value={600}>直近 600</option>
              <option value={1000}>直近 1000</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-neutral-400">キュー（プリセット/手動）</label>
            <div className="flex gap-2 mb-2">
              {([
                { k: "ranked", label: "ランク" },
                { k: "normal", label: "ノーマル" },
                { k: "aram", label: "ARAM" },
                { k: "all", label: "全て" },
              ] as const).map(({ k, label }) => (
                <button
                  key={k}
                  onClick={() => applyPreset(k)}
                  className={`px-3 py-1 rounded-lg border ${
                    preset === k ? "bg-white/10 border-neutral-600" : "bg-neutral-950 border-neutral-800 hover:bg-white/5"
                  } text-sm`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={queues}
              onChange={(e) => {
                setQueues(e.target.value);
                setPreset("custom");
              }}
              className="w-48 rounded-xl bg-neutral-950 border border-neutral-800 p-2"
            />
            <p className="text-[11px] text-neutral-500 mt-1">例: ランク=420,440 / ノーマル=400,430,490 / ARAM=450</p>
          </div>
          <button
            onClick={run}
            disabled={loading || !riotId.includes("#")}
            className="rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-50 px-4 py-2"
          >
            {loading ? "検索中…" : "検索"}
          </button>
          <div className="flex items-center gap-2 ml-auto text-xs text-neutral-400">
            <input id="streaming" type="checkbox" checked={streaming} onChange={(e)=>setStreaming(e.target.checked)} />
            <label htmlFor="streaming">高速表示（ストリーミング）</label>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mt-2">エラー: {String(error)}</p>}
        {progress && (
          <div className="mt-3">
            <div className="h-2 w-full rounded bg-white/10 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((progress.done/Math.max(1,progress.total))*100)}%` }} />
            </div>
            <div className="text-xs text-neutral-400 mt-1">{progress.done} / {progress.total}</div>
          </div>
        )}
        {progress && (
          <div className="mt-3">
            <div className="h-2 w-full rounded bg-white/10 overflow-hidden">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((progress.done/Math.max(1,progress.total))*100)}%` }} />
            </div>
            <div className="text-xs text-neutral-400 mt-1">{progress.done} / {progress.total}</div>
          </div>
        )}
      </Card>

      {partial && !data && (
        <Card title="進捗（クイック表示）">
          <div className="text-sm text-neutral-300 mb-2">段階的に更新中… 完了までお待ちください。</div>
          {partial.topUsed && (
            <div className="flex flex-wrap gap-2">
              {(partial.topUsed as any[]).slice(0,8).map((c, i) => (
                <span key={i} className="text-xs px-2 py-1 rounded-lg bg-white/10 border border-white/10">{c.name}</span>
              ))}
            </div>
          )}
        </Card>
      )}

      {loading && !data && !partial && (
        <>
          <section className="grid md:grid-cols-4 gap-4">
            <CardSkeleton lines={1} />
            <CardSkeleton lines={1} />
            <CardSkeleton lines={1} />
            <CardSkeleton lines={1} />
          </section>
          <section className="grid md:grid-cols-2 gap-4 mt-4">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
            <ListSkeleton />
          </section>
        </>
      )}

      {data && (
        <>
          {data.insights && (
            <Card title="AI分析（ルールベース・ベータ）">
              <p className="text-sm mb-2 text-neutral-200">{data.insights.summary}</p>
              {data.insights.bullets.length > 0 && (
                <ul className="list-disc list-inside text-sm text-neutral-300 space-y-1">
                  {data.insights.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <section className="grid md:grid-cols-4 gap-4">
            <Card title="Riot ID">
              <div className="text-lg">{data.meta.riotId}</div>
            </Card>
            <Card title="総試合数">
              <div className="text-2xl">{data.meta.totalGames}</div>
            </Card>
            <Card title="得意レーン">
              <div className="text-lg">{data.bestLane}</div>
            </Card>
            <Card title="生成日時">
              <div className="text-sm">{new Date(data.meta.generatedAt).toLocaleString()}</div>
            </Card>
            <Card title="リージョン">
              <div className="text-sm uppercase">{data.meta.cluster}</div>
            </Card>
          </section>

          <section className="grid md:grid-cols-2 gap-4">
            <Card title="使用数 TOP10">
              <Bar
                data={{
                  labels: data.topUsed.map((c) => c.name),
                  datasets: [{
                    label: "試合数",
                    data: data.topUsed.map((c) => c.games),
                    backgroundColor: "rgba(96, 165, 250, 0.7)", // blue-400
                    hoverBackgroundColor: "rgba(96, 165, 250, 0.9)",
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: true, labels: { color: "#e5e7eb" } } },
                  scales: {
                    x: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" } },
                    y: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" } },
                  },
                }}
              />
            </Card>
            <Card title="勝率 TOP10（5試合以上）">
              <Bar
                data={{
                  labels: data.topWinRate.map((c) => c.name),
                  datasets: [{
                    label: "勝率(%)",
                    data: data.topWinRate.map((c) => c.winRate),
                    backgroundColor: "rgba(52, 211, 153, 0.7)", // emerald-400
                    hoverBackgroundColor: "rgba(52, 211, 153, 0.9)",
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: true, labels: { color: "#e5e7eb" } } },
                  scales: {
                    x: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" } },
                    y: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(255,255,255,0.08)" } },
                  },
                }}
              />
            </Card>
            <Card title="レーン分布">
              <Doughnut
                data={{
                  labels: data.lanes.map((l) => l.lane),
                  datasets: [{
                    label: "試合数",
                    data: data.lanes.map((l) => l.games),
                    backgroundColor: [
                      "#60a5fa", // blue-400
                      "#34d399", // emerald-400
                      "#fbbf24", // amber-400
                      "#f472b6", // pink-400
                      "#a78bfa", // violet-400
                      "#f87171", // red-400
                    ],
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { labels: { color: "#e5e7eb" } } },
                }}
              />
            </Card>
            <Card title="チャンピオン一覧">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {data.champions
                  .sort((a, b) => b.games - a.games)
                  .map((ch) => (
                    <div key={ch.name} className="flex items-center gap-3">
                      <img src={ch.icon} alt={ch.name} width={36} height={36} className="rounded-lg" />
                      <div className="text-sm">
                        <div className="font-medium">{ch.name}</div>
                        <div className="text-neutral-400">
                          {ch.games}G / {ch.winRate}%
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          </section>

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-neutral-400">共有</div>
            <ShareButtons
              getUrl={() => {
                const u = new URL(window.location.origin);
                u.pathname = "/";
                u.searchParams.set("riotId", riotId.trim());
                u.searchParams.set("year", String(year));
                u.searchParams.set("queues", queues);
                u.searchParams.set("cluster", cluster);
                u.searchParams.set("limit", String(limit));
                return u.toString();
              }}
              text={`LoL 年間サマリー: ${riotId} (${year})`}
            />
          </div>

          <Card title="広告・PR（プレースホルダ）">
            <div className="text-sm text-neutral-300">
              <span className="px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 mr-2">PR</span>
              ここにアフィリエイト枠（ゲーミングデバイス等）を表示。※表記の明示をお忘れなく
            </div>
          </Card>
        </>
      )}
      {!data && (
        <Card title="ヒント">
          <ul className="list-disc list-inside text-sm text-neutral-300 space-y-1">
            <li>Riot ID は <span className="text-neutral-100">GameName#TagLine</span> 形式（例: <span className="text-neutral-100">Taro#JP1</span>）。</li>
            <li>ノーマルを見るときはプリセット「ノーマル」または <span className="text-neutral-100">400,430,490</span>。</li>
            <li>レート制限で遅延する場合があります（429 時に自動バックオフ）。</li>
          </ul>
        </Card>
      )}
    </main>
  );
}

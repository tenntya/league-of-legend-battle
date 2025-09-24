"use client";
import { useMemo, useRef, useState } from "react";
import Card from "@/components/Card";
import MetaKPI from "@/components/MetaKPI";
import { Bar, Doughnut, Chart as ChartComponent } from "react-chartjs-2";
import { CardSkeleton, ChartSkeleton, ListSkeleton } from "@/components/Skeleton";
import ShareButtons from "@/components/ShareButtons";
import EmptyState from "@/components/EmptyState";
import ChartJS from "chart.js/auto";
// ダーク背景でも視認できるようにデフォルトカラーを調整
ChartJS.defaults.color = "#e5e7eb"; // tailwind neutral-200
ChartJS.defaults.borderColor = "rgba(255,255,255,0.08)";
// ツールチップのフォント/色を軽く統一
ChartJS.defaults.plugins.tooltip.backgroundColor = "rgba(17,17,17,0.9)";
ChartJS.defaults.plugins.tooltip.borderColor = "rgba(255,255,255,0.08)";
ChartJS.defaults.plugins.tooltip.borderWidth = 1;

type Champ = { name: string; games: number; wins: number; winRate: number; icon: string; lane?: string; primaryPatch?: string };
type Lane = { lane: string; games: number; wins: number; winRate: number };
type Cluster = "americas" | "asia" | "europe";
type Api = {
  meta: { riotId: string; totalGames: number; year: number; cluster: string; queues: number[]; generatedAt: string };
  champions: Champ[];
  lanes: Lane[];
  topUsed: Champ[];
  topWinRate: Champ[];
  bestLane: string;
  byPatch?: { patch: string; totalGames: number; topUsed: Omit<Champ, 'icon'>[]; topWinRate: Omit<Champ, 'icon'>[]; lanes: Lane[]; bestLane: string }[];
  bySplit?: { key: string; label: string; totalGames: number; topUsed: Omit<Champ, 'icon'>[]; topWinRate: Omit<Champ, 'icon'>[]; lanes: Lane[]; bestLane: string }[];
  insights?: { summary: string; bullets: string[] };
};

export default function Page() {
  const now = new Date();
  const [riotId, setRiotId] = useState("");
  const riotInputRef = useRef<HTMLInputElement | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [mode, setMode] = useState<"year" | "patch" | "patches" | "splits" | "custom">("year");
  const [patchStr, setPatchStr] = useState<string>("");
  const [patchCount, setPatchCount] = useState<number>(12);
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [queues, setQueues] = useState<string>("420,440");
  const [cluster, setCluster] = useState<Cluster>("asia"); // 既定を JP/KR の Asia に
  const [preset, setPreset] = useState<"ranked" | "normal" | "aram" | "all">("ranked");
  const [limit, setLimit] = useState<number>(100);
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
      u.searchParams.set("mode", mode);
      if (mode === "patch" && patchStr) u.searchParams.set("patch", patchStr);
      if (mode === "patches") u.searchParams.set("patchCount", String(patchCount));
      if (mode === "custom") {
        if (fromDate) u.searchParams.set("from", fromDate);
        if (toDate) u.searchParams.set("to", toDate);
      }
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
      <header className="space-y-3" aria-label="アプリの概要">
        <h1 className="text-h1 font-semibold tracking-tight bg-gradient-to-r from-white to-brand-primary bg-clip-text text-transparent">1年のLoL、いま秒で見える</h1>
        <p className="text-neutral-400 text-small">Riot ID から「使用数・勝率・得意レーン」をさくっと集計</p>
      </header>

      <Card title="検索">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-3 items-start md:items-end">
          <div className="w-full md:flex-[2] md:min-w-[420px] lg:min-w-[560px]">
            <label className="text-label text-neutral-400" htmlFor="riotId">Riot ID（例: Taro#JP1）</label>
            <input
              id="riotId"
              value={riotId}
              onChange={(e) => setRiotId(e.target.value)}
              placeholder="GameName#TagLine（大文字・#・数字を確認）"
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 outline-none transition-soft focus:border-blue-400/50"
              aria-label="Riot ID 入力"
              ref={riotInputRef}
            />
          </div>
          <div className="w-full md:w-44">
            <label className="text-label text-neutral-400" htmlFor="cluster">地域</label>
            <select
              id="cluster"
              value={cluster}
              onChange={(e) => setCluster(e.target.value as Cluster)}
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50"
            >
              <option value="asia">JP / KR（Asia）</option>
              <option value="americas">NA / BR / LAN / LAS / OCE（Americas）</option>
              <option value="europe">EUW / EUNE / TR / RU（Europe）</option>
            </select>
          </div>
          <div className="w-full md:w-40">
            <label className="text-label text-neutral-400" htmlFor="mode">対象期間</label>
            <select id="mode" value={mode} onChange={(e)=>setMode(e.target.value as any)} className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50">
              <option value="year">年</option>
              <option value="patch">パッチ</option>
              <option value="patches">パッチ一覧</option>
              <option value="splits">スプリット（β）</option>
              <option value="custom">期間指定</option>
            </select>
          </div>
          {mode === "year" && (
          <div className="w-full md:w-28">
            <label className="text-label text-neutral-400" htmlFor="year">年</label>
            <select
              id="year"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          )}
          <div className="w-full md:w-36">
            <label className="text-label text-neutral-400" htmlFor="limit">対象試合数（上限）</label>
            <select
              id="limit"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50"
            >
              <option value={100}>直近 100</option>
              <option value={300}>直近 300</option>
              <option value={600}>直近 600</option>
              <option value={1000}>直近 1000</option>
            </select>
          </div>
          {mode === "patch" && (
            <div className="w-full md:w-28">
              <label className="text-label text-neutral-400" htmlFor="patch">パッチ</label>
              <input id="patch" value={patchStr} onChange={(e)=>setPatchStr(e.target.value)} placeholder="例: 14.18" className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50" />
            </div>
          )}
          {mode === "custom" && (
            <div className="flex w-full md:w-auto items-end gap-3">
              <div>
                <label className="text-label text-neutral-400" htmlFor="from">開始日</label>
                <input id="from" type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)} className="rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50" />
              </div>
              <div>
                <label className="text-label text-neutral-400" htmlFor="to">終了日</label>
                <input id="to" type="date" value={toDate} onChange={(e)=>setToDate(e.target.value)} className="rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50" />
              </div>
            </div>
          )}
          {mode === "patches" && (
            <div className="w-full md:w-36">
              <label className="text-label text-neutral-400" htmlFor="patchCount">パッチ数</label>
              <select id="patchCount" value={patchCount} onChange={(e)=>setPatchCount(Number(e.target.value))} className="w-full rounded-xl bg-neutral-950 border border-neutral-800 p-2 transition-soft focus:border-blue-400/50">
                {[10,12,16,20].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          <div className="w-full md:w-auto">
            <label className="text-label text-neutral-400">キュー（プリセット）</label>
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
                  className={`px-3 py-1 rounded-lg border transition-soft text-small ${
                    preset === k
                      ? "bg-white/10 border-blue-400/40 ring-2 ring-blue-500/30"
                      : "bg-neutral-950 border-neutral-800 hover:bg-white/5"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={run}
            disabled={loading || !riotId.includes("#")}
            className="w-full md:w-auto rounded-xl disabled:opacity-50 px-4 py-2 transition-soft bg-gradient-to-r from-brand-primary/30 to-brand-secondary/30 hover:from-brand-primary/40 hover:to-brand-secondary/40 border border-white/10 shrink-0 md:self-end"
            aria-disabled={loading || !riotId.includes('#')}
            >
            {loading ? "検索中…" : "検索"}
          </button>
          <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto text-xs text-neutral-400 md:self-end">
            <input id="streaming" type="checkbox" checked={streaming} onChange={(e)=>setStreaming(e.target.checked)} />
            <label htmlFor="streaming">高速表示（ストリーミング）</label>
          </div>
        </div>
        {error && <p className="text-red-400 text-sm mt-2" aria-live="polite">{describeError(String(error))}</p>}
        {progress && (
          <div className="mt-3">
            <div className="h-2 w-full rounded bg-white/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label="取得進捗">
              <div className="h-full bg-blue-500 transition-all" style={{ width: `${Math.round((progress.done/Math.max(1,progress.total))*100)}%` }} />
            </div>
            <div className="text-xs text-neutral-400 mt-1" aria-live="polite">{progress.done} / {progress.total}</div>
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

      {data && (() => {
        const total = (data.meta?.totalGames ?? 0);
        const champCount = (data.champions?.length ?? 0);
        const isEmpty = total === 0 || champCount === 0;
        const isSparse = !isEmpty && champCount < 3;
        if (isEmpty || isSparse) {
          const title = isEmpty ? "表示できるデータがありません" : "データが少なく精度が低いかも";
          const message = isEmpty
            ? "条件を少し変えて、もう一度お試しください。"
            : "試合数が少ないため傾向のブレが大きい可能性があります。";
          return (
            <Card title={isEmpty ? "結果" : "ヒント"}>
              <EmptyState
                variant={isEmpty ? "empty" : "sparse"}
                title={title}
                message={message}
                actions={[
                  { label: `年を${now.getFullYear()}に切替`, onClick: () => setYear(now.getFullYear()) },
                  { label: "ノーマルを含める", onClick: () => applyPreset("normal") },
                  { label: "対象試合数を300へ", onClick: () => setLimit(300) },
                  { label: "Riot ID形式を確認", onClick: () => riotInputRef.current?.focus() },
                ]}
              />
            </Card>
          );
        }
        return (<>
          {data.byPatch && data.byPatch.length > 0 && (
            <Card title="パッチ別サマリー（直近）">
              <div className="flex gap-3 overflow-x-auto pb-1">
                {data.byPatch.map((p) => (
                  <button onClick={() => { setMode('patch'); setPatchStr(p.patch); run(); }} key={p.patch} className="text-left min-w-[200px] rounded-xl ring-1 ring-white/10 bg-neutral-950/60 p-3 hover:bg-white/5 transition-colors">
                    <div className="text-label text-neutral-400 mb-1">Patch {p.patch}</div>
                    <div className="text-small text-neutral-300">{p.totalGames.toLocaleString()} 試合</div>
                    <div className="text-small text-neutral-400">Best: {p.bestLane}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.topUsed.slice(0,3).map((c) => (
                        <span key={c.name} className="text-[11px] px-2 py-0.5 rounded bg-white/5 border border-white/10">{c.name}</span>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
          {data.bySplit && data.bySplit.length > 0 && (
            <Card title="スプリット別サマリー（暫定）">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {data.bySplit.map((s) => (
                  <div key={s.key} className="rounded-xl ring-1 ring-white/10 bg-neutral-950/60 p-3">
                    <div className="text-label text-neutral-400 mb-1">{s.label}</div>
                    <div className="text-small text-neutral-300">{s.totalGames.toLocaleString()} 試合</div>
                    <div className="text-small text-neutral-400">Best: {s.bestLane}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {s.topUsed.slice(0,3).map((c) => (
                        <span key={c.name} className="text-[11px] px-2 py-0.5 rounded bg-white/5 border border-white/10">{c.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {data.insights && (
            <Card title="AI分析（ルールベース・ベータ）">
              <p className="text-sm mb-2 text-neutral-200">{data.insights.summary}</p>
              {Array.isArray(data.insights.bullets) && data.insights.bullets.length > 0 && (
                <ul className="list-disc list-inside text-sm text-neutral-300 space-y-1">
                  {data.insights.bullets.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          <MetaKPI meta={data.meta as any} bestLane={data.bestLane} />

          <section className="grid md:grid-cols-2 gap-4">
            <Card title="使用数/勝率（TOP10 合成）">
              <div className="h-[360px]">
              {(() => {
                const labels = data.topUsed.map((c) => c.name);
                const games = data.topUsed.map((c) => c.games);
                const wrMap = new Map(data.champions.map((c) => [c.name, c.winRate]));
                const winRates = labels.map((n) => wrMap.get(n) || 0);
                return (
                  <ChartComponent
                    type='bar'
                    data={{
                      labels,
                      datasets: [
                        {
                          type: 'bar',
                          label: '試合数',
                          data: games,
                          backgroundColor: 'rgba(96, 165, 250, 0.7)',
                          hoverBackgroundColor: 'rgba(96, 165, 250, 0.9)',
                          yAxisID: 'y',
                        },
                        {
                          type: 'line',
                          label: '勝率(%)',
                          data: winRates,
                          borderColor: '#34d399',
                          backgroundColor: 'rgba(52, 211, 153, 0.2)',
                          tension: 0.3,
                          yAxisID: 'y1',
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { display: true, labels: { color: '#e5e7eb' } },
                        tooltip: {
                          callbacks: {
                            label: (ctx) => ctx.datasetIndex === 0
                              ? `試合数: ${Number(ctx.parsed.y).toLocaleString()}`
                              : `勝率: ${Number(ctx.parsed.y).toFixed(1)}%`,
                          },
                        },
                      },
                      scales: {
                        x: { ticks: { color: '#e5e7eb' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                        y: { ticks: { color: '#e5e7eb' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                        y1: { position: 'right' as const, min: 0, max: 100, ticks: { color: '#e5e7eb', callback: (v) => `${v}%` }, grid: { drawOnChartArea: false } },
                      },
                    }}
                  />
                );
              })()}
              </div>
            </Card>
            <Card title="レーン分布">
              <div className="h-[320px]">
              <Doughnut
                data={{
                  labels: data.lanes.map((l) => l.lane),
                  datasets: [{
                    label: "試合数",
                    data: data.lanes.map((l) => l.games),
                    backgroundColor: [
                      "#60a5fa", // brand.primary
                      "#34d399", // brand.secondary
                      "#fbbf24", // amber-400
                      "#f472b6", // brand.pink
                      "#a78bfa", // brand.violet
                      "#f87171", // red-400
                    ],
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { labels: { color: "#e5e7eb" } },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => `${ctx.label}: ${Number(ctx.parsed).toLocaleString()} 試合`,
                      },
                    },
                  },
                }}
              />
              </div>
            </Card>
            <div className="md:col-span-2">
              <Card title="チャンピオン一覧（レーン別）">
                {(() => {
                  const cols: { code: string; label: string }[] = [
                    { code: 'TOP', label: 'TOP' },
                    { code: 'JUNGLE', label: 'JNG' },
                    { code: 'MIDDLE', label: 'MID' },
                    { code: 'BOTTOM', label: 'BOT' },
                    { code: 'UTILITY', label: 'SUP' },
                  ];
                  const colItems = cols.map(c => ({ ...c, items: data.champions.filter(x => (x.lane || 'UNKNOWN') === c.code).sort((a,b)=>b.games-a.games) }));
                  const unknown = data.champions.filter(x => (x.lane || 'UNKNOWN') === 'UNKNOWN').sort((a,b)=>b.games-a.games);
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {colItems.map(({ code, label, items }) => (
                        <div key={code}>
                          <div className="text-label text-neutral-400 mb-2">{label}</div>
                          <div className="space-y-2">
                            {items.map((ch) => (
                              <div key={ch.name} className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors">
                                <img src={ch.icon} alt={ch.name} width={36} height={36} className="rounded-xl ring-1 ring-white/10" />
                                <div className="text-sm">
                                  <div className="font-medium flex items-center gap-2">
                                    <span>{ch.name}</span>
                                    {ch.primaryPatch && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">P{ch.primaryPatch}</span>}
                                  </div>
                                  <div className="text-neutral-500 text-small">{ch.games}G / {ch.winRate}%</div>
                                </div>
                              </div>
                            ))}
                            {items.length === 0 && <div className="text-small text-neutral-600">-</div>}
                          </div>
                        </div>
                      ))}
                      {unknown.length > 0 && (
                        <div className="lg:col-span-5">
                          <div className="text-label text-neutral-400 mb-2">UNKNOWN</div>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            {unknown.map((ch) => (
                              <div key={ch.name} className="group flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg hover:bg-white/5 transition-colors">
                                <img src={ch.icon} alt={ch.name} width={36} height={36} className="rounded-xl ring-1 ring-white/10" />
                                <div className="text-sm">
                                  <div className="font-medium flex items-center gap-2">
                                    <span>{ch.name}</span>
                                    {ch.primaryPatch && <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10">P{ch.primaryPatch}</span>}
                                  </div>
                                  <div className="text-neutral-500 text-small">{ch.games}G / {ch.winRate}%</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </Card>
            </div>
          </section>

          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-neutral-400">共有</div>
            <ShareButtons
              getUrl={() => {
                const u = new URL(window.location.origin);
                u.pathname = "/share";
                u.searchParams.set("riotId", riotId.trim());
                u.searchParams.set("year", String(year));
                u.searchParams.set("queues", queues);
                u.searchParams.set("cluster", cluster);
                u.searchParams.set("limit", String(limit));
                if (data?.bestLane) u.searchParams.set("bestLane", data.bestLane);
                if (data?.topUsed && data.topUsed.length > 0) {
                  const top = data.topUsed.slice(0, 3).map((c) => `${c.name}:${c.games}:${c.winRate}`);
                  u.searchParams.set("top", top.join(","));
                }
                // Add cache-buster to force X to refresh card preview
                u.searchParams.set("v", String(Date.now()));
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
        </>);
      })()}
      {/* ヒントセクションは非表示に変更 */}
    </main>
  );
}
  function describeError(code: string): string {
    switch (code) {
      case "unauthorized":
        return "認証エラー: Riot API キーが無効または期限切れです。開発者ポータルでキーを再発行し .env.local を更新後、サーバーを再起動してください。";
      case "invalid_riot_id":
        return "Riot ID が無効です。GameName#TagLine（大文字・#・数字）をご確認ください。";
      case "rate_limited":
        return "一時的にアクセスが集中しています。数十秒おいて再試行してください。";
      case "server_misconfigured":
        return "サーバー設定エラー: RIOT_API_KEY が未設定です。開発者に連絡してください。";
      case "stream_error":
        return "通信エラーが発生しました。ネットワークを確認し、再試行してください。";
      default:
        return `エラー: ${code}`;
    }
  }

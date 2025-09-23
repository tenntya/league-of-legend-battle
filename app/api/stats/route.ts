import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import {
  getAccountByRiotId,
          detectCluster,
  listMatchIds,
  getPlayerSlice,
  getLatestDDragonVersion,
  championIcon,
  type Cluster
} from "@/lib/riot";
import { analyzeSeason } from "@/lib/analysis";
import type { PlayerSlice } from "@/lib/riot";

export const runtime = "nodejs";

const Query = z.object({
  riotId: z.string().min(3),
  year: z.coerce.number().int().min(2010).max(2100).default(new Date().getFullYear()),
  queues: z.string().optional(),
  cluster: z.enum(["americas", "asia", "europe"]).optional(),
  limit: z.coerce.number().int().min(50).max(2000).default(300),
  mode: z.enum(["year", "patch", "patches", "splits", "custom"]).default("year").optional(),
  patch: z.string().regex(/^\d{1,2}\.\d{1,2}$/).optional(),
  patchCount: z.coerce.number().int().min(1).max(20).default(12).optional(),
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(),   // YYYY-MM-DD
});

function yearRangeJST(year: number) {
  const tzOffset = 9 * 60; // JST
  const start = Date.UTC(year, 0, 1, 0, 0) / 1000 - tzOffset * 60;
  const end = Date.UTC(year, 11, 31, 23, 59, 59) / 1000 - tzOffset * 60;
  return { start, end };
}

function dateRangeJST(from?: string | null, to?: string | null) {
  if (!from && !to) return null;
  const tzOffset = 9 * 60; // JST
  let start = 0;
  let end = Math.floor(Date.now() / 1000);
  if (from) {
    const [y, m, d] = from.split("-").map((n) => Number(n));
    start = Date.UTC(y, (m - 1) || 0, d || 1, 0, 0) / 1000 - tzOffset * 60;
  }
  if (to) {
    const [y, m, d] = to.split("-").map((n) => Number(n));
    end = Date.UTC(y, (m - 1) || 0, d || 1, 23, 59, 59) / 1000 - tzOffset * 60;
  }
  return { start, end };
}

export async function GET(req: NextRequest) {
  try {
    if (!process.env.RIOT_API_KEY) {
      return new Response(JSON.stringify({ error: "server_misconfigured", message: "RIOT_API_KEY missing" }), { status: 500 });
    }
    const { searchParams } = new URL(req.url);
    const parsed = Query.parse({
      riotId: searchParams.get("riotId"),
      year: searchParams.get("year"),
      queues: searchParams.get("queues"),
      mode: searchParams.get("mode"),
      patch: searchParams.get("patch"),
      from: searchParams.get("from"),
      to: searchParams.get("to"),
    });

    const rawQueues = parsed.queues ?? process.env.DEFAULT_QUEUES ?? "";
    const queues = rawQueues
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x));

    const custom = parsed.mode === "custom" ? dateRangeJST(parsed.from, parsed.to) : null;
    const { start, end } = custom || yearRangeJST(parsed.year);

    const account = await getAccountByRiotId(parsed.riotId);
    const cluster: Cluster = parsed.cluster ?? (await detectCluster(account.puuid, account.tagLine));

    const ids = await listMatchIds(cluster, account.puuid, start, end, queues, parsed.limit);

    const slices: PlayerSlice[] = [];
    const concurrency = 8; // ほどほどに引き上げ（429 は fetchRiot でバックオフ）
    for (let i = 0; i < ids.length; i += concurrency) {
      const chunk = ids.slice(i, i + concurrency);
      const results = await Promise.all(chunk.map((id) => getPlayerSlice(cluster, id, account.puuid)));
      for (const r of results) if (r) slices.push(r);
    }

    type ChampAgg = { games: number; wins: number; name: string };
    const champs = new Map<string, ChampAgg>();
    const lanes = new Map<string, { games: number; wins: number }>();
    const champLaneCount = new Map<string, Map<string, number>>();
    const champPatchCount = new Map<string, Map<string, number>>();

    // パッチ指定時は対象パッチに絞る
    const filtered = parsed.mode === "patch" && parsed.patch
      ? slices.filter((s) => s.patch === parsed.patch)
      : slices;

    for (const s of filtered) {
      const c = champs.get(s.championName) ?? { games: 0, wins: 0, name: s.championName };
      c.games += 1; c.wins += s.win ? 1 : 0;
      champs.set(s.championName, c);

      const lane = (s.teamPosition || "UNKNOWN").toUpperCase();
      const l = lanes.get(lane) ?? { games: 0, wins: 0 };
      l.games += 1; l.wins += s.win ? 1 : 0;
      lanes.set(lane, l);

      // per-champion lane distribution
      const lm = champLaneCount.get(s.championName) ?? new Map<string, number>();
      lm.set(lane, (lm.get(lane) ?? 0) + 1);
      champLaneCount.set(s.championName, lm);

      // per-champion patch distribution
      if (s.patch) {
        const pm = champPatchCount.get(s.championName) ?? new Map<string, number>();
        pm.set(s.patch, (pm.get(s.patch) ?? 0) + 1);
        champPatchCount.set(s.championName, pm);
      }
    }

    const totalGames = filtered.length;
    const ver = await getLatestDDragonVersion();

    const champions = Array.from(champs.values()).map((c) => {
      const lm = champLaneCount.get(c.name);
      let laneBest: string | undefined;
      if (lm) laneBest = Array.from(lm.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0];
      const pm = champPatchCount.get(c.name);
      let primaryPatch: string | undefined;
      if (pm) primaryPatch = Array.from(pm.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0];
      return {
        name: c.name,
        games: c.games,
        wins: c.wins,
        winRate: Math.round((c.wins / Math.max(1, c.games)) * 1000) / 10,
        lane: laneBest,
        primaryPatch,
        icon: championIcon(ver, c.name),
      };
    });

    const lanesArr = Array.from(lanes.entries()).map(([lane, v]) => ({
      lane, games: v.games, wins: v.wins,
      winRate: Math.round((v.wins / Math.max(1, v.games)) * 1000) / 10
    }));

    const topUsed = [...champions].sort((a,b)=>b.games-a.games).slice(0,10);
    const topWinRate = [...champions].filter(c=>c.games>=5).sort((a,b)=>b.winRate-a.winRate).slice(0,10);

    const laneThreshold = 10;
    const eligibleLanes = lanesArr.filter(l => l.games >= laneThreshold).sort((a,b)=>b.winRate-a.winRate);
    const bestLane = eligibleLanes[0]?.lane || "UNKNOWN";

    const insights = analyzeSeason({
      meta: { year: parsed.year, totalGames },
      champions: champions.map(({ name, games, wins, winRate }) => ({ name, games, wins, winRate })),
      lanes: lanesArr,
    });

    // 追加: パッチ一覧モード（直近 patchCount 件）
    let byPatch: any[] | undefined;
    if (parsed.mode === "patches") {
      const map = new Map<string, PlayerSlice[]>();
      for (const s of slices) {
        if (!s.patch) continue;
        const arr = map.get(s.patch) || [];
        arr.push(s);
        map.set(s.patch, arr);
      }
      const patches = Array.from(map.keys());
      const key = (p: string) => p.split(".").map((n) => Number(n));
      patches.sort((a, b) => {
        const A = key(a); const B = key(b);
        return A[0] === B[0] ? B[1] - A[1] : B[0] - A[0];
      });
      const take = patches.slice(0, parsed.patchCount || 12);
      byPatch = take.map((p) => {
        const arr = map.get(p)!;
        const cc = new Map<string, { games: number; wins: number; name: string }>();
        const ll = new Map<string, { games: number; wins: number }>();
        for (const s of arr) {
          const c = cc.get(s.championName) ?? { games: 0, wins: 0, name: s.championName };
          c.games += 1; c.wins += s.win ? 1 : 0; cc.set(s.championName, c);
          const lane = (s.teamPosition || "UNKNOWN").toUpperCase();
          const l = ll.get(lane) ?? { games: 0, wins: 0 }; l.games += 1; l.wins += s.win ? 1 : 0; ll.set(lane, l);
        }
        const champions = Array.from(cc.values()).map((c) => ({ name: c.name, games: c.games, wins: c.wins, winRate: Math.round((c.wins / Math.max(1, c.games)) * 1000) / 10 }));
        const lanes = Array.from(ll.entries()).map(([lane, v]) => ({ lane, games: v.games, wins: v.wins, winRate: Math.round((v.wins / Math.max(1, v.games)) * 1000) / 10 }));
        const topUsed = [...champions].sort((a,b)=>b.games-a.games).slice(0,5);
        const topWinRate = [...champions].filter(c=>c.games>=5).sort((a,b)=>b.winRate-a.winRate).slice(0,5);
        const laneThreshold = 10; const eligibleLanes = lanes.filter(l=>l.games>=laneThreshold).sort((a,b)=>b.winRate-a.winRate);
        const bestLane = eligibleLanes[0]?.lane || "UNKNOWN";
        return { patch: p, totalGames: arr.length, topUsed, topWinRate, lanes, bestLane };
      });
    }

    // 追加: スプリット（暫定: 年を3分割）
    let bySplit: any[] | undefined;
    if (parsed.mode === "splits") {
      const q1 = { start: Date.UTC(parsed.year, 0, 1, 0, 0) / 1000 - 9*60*60, end: Date.UTC(parsed.year, 3, 30, 23, 59, 59) / 1000 - 9*60*60 };
      const q2 = { start: Date.UTC(parsed.year, 4, 1, 0, 0) / 1000 - 9*60*60, end: Date.UTC(parsed.year, 7, 31, 23, 59, 59) / 1000 - 9*60*60 };
      const q3 = { start: Date.UTC(parsed.year, 8, 1, 0, 0) / 1000 - 9*60*60, end: Date.UTC(parsed.year, 11, 31, 23, 59, 59) / 1000 - 9*60*60 };
      const defs = [
        { key: "S1", label: "Split 1", range: q1 },
        { key: "S2", label: "Split 2", range: q2 },
        { key: "S3", label: "Split 3", range: q3 },
      ];
      bySplit = defs.map((d) => {
        const arr = slices.filter((s) => typeof s.ts === 'number' && (s.ts! / 1000) >= d.range.start && (s.ts! / 1000) <= d.range.end);
        const cc = new Map<string, { games: number; wins: number; name: string }>();
        const ll = new Map<string, { games: number; wins: number }>();
        for (const s of arr) {
          const c = cc.get(s.championName) ?? { games: 0, wins: 0, name: s.championName };
          c.games += 1; c.wins += s.win ? 1 : 0; cc.set(s.championName, c);
          const lane = (s.teamPosition || "UNKNOWN").toUpperCase();
          const l = ll.get(lane) ?? { games: 0, wins: 0 }; l.games += 1; l.wins += s.win ? 1 : 0; ll.set(lane, l);
        }
        const champions = Array.from(cc.values()).map((c) => ({ name: c.name, games: c.games, wins: c.wins, winRate: Math.round((c.wins / Math.max(1, c.games)) * 1000) / 10 }));
        const lanes = Array.from(ll.entries()).map(([lane, v]) => ({ lane, games: v.games, wins: v.wins, winRate: Math.round((v.wins / Math.max(1, v.games)) * 1000) / 10 }));
        const topUsed = [...champions].sort((a,b)=>b.games-a.games).slice(0,5);
        const topWinRate = [...champions].filter(c=>c.games>=5).sort((a,b)=>b.winRate-a.winRate).slice(0,5);
        const laneThreshold = 10; const eligibleLanes = lanes.filter(l=>l.games>=laneThreshold).sort((a,b)=>b.winRate-a.winRate);
        const bestLane = eligibleLanes[0]?.lane || "UNKNOWN";
        return { key: d.key, label: d.label, totalGames: arr.length, topUsed, topWinRate, lanes, bestLane };
      });
    }

    return Response.json({
      meta: {
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid.slice(0,8) + "…",
        cluster, year: parsed.year, queues, totalGames,
        generatedAt: new Date().toISOString()
      },
      champions, lanes: lanesArr, topUsed, topWinRate, bestLane,
      byPatch, bySplit,
      insights
    }, { headers: { "Cache-Control": "no-store" }});
          } catch (e: any) {
            if (e instanceof ZodError) {
              return new Response(
                JSON.stringify({ error: "invalid_query", issues: e.issues }),
                { status: 400 }
              );
            }
            const msg = e?.message || "unknown_error";
            const status = msg === "invalid_riot_id" ? 400
              : msg === "unauthorized" ? 401
              : msg === "not_found" ? 404
              : 500;
            return new Response(JSON.stringify({ error: msg }), { status });
          }
        }

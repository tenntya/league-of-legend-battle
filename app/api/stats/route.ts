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

export const runtime = "nodejs";

const Query = z.object({
  riotId: z.string().min(3),
  year: z.coerce.number().int().min(2010).max(2100).default(new Date().getFullYear()),
  queues: z.string().optional(),
  cluster: z.enum(["americas", "asia", "europe"]).optional(),
  limit: z.coerce.number().int().min(50).max(2000).default(300),
});

function yearRangeJST(year: number) {
  const tzOffset = 9 * 60; // JST
  const start = Date.UTC(year, 0, 1, 0, 0) / 1000 - tzOffset * 60;
  const end = Date.UTC(year, 11, 31, 23, 59, 59) / 1000 - tzOffset * 60;
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
    });

    const rawQueues = parsed.queues ?? process.env.DEFAULT_QUEUES ?? "";
    const queues = rawQueues
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x));

    const { start, end } = yearRangeJST(parsed.year);

    const account = await getAccountByRiotId(parsed.riotId);
    const cluster: Cluster = parsed.cluster ?? (await detectCluster(account.puuid, account.tagLine));

    const ids = await listMatchIds(cluster, account.puuid, start, end, queues, parsed.limit);

    const slices = [] as Awaited<ReturnType<typeof getPlayerSlice>>[];
    const concurrency = 8; // ほどほどに引き上げ（429 は fetchRiot でバックオフ）
    for (let i = 0; i < ids.length; i += concurrency) {
      const chunk = ids.slice(i, i + concurrency);
      const results = await Promise.all(chunk.map((id) => getPlayerSlice(cluster, id, account.puuid)));
      for (const r of results) if (r) slices.push(r);
    }

    type ChampAgg = { games: number; wins: number; name: string };
    const champs = new Map<string, ChampAgg>();
    const lanes = new Map<string, { games: number; wins: number }>();

    for (const s of slices) {
      const c = champs.get(s.championName) ?? { games: 0, wins: 0, name: s.championName };
      c.games += 1; c.wins += s.win ? 1 : 0;
      champs.set(s.championName, c);

      const lane = (s.teamPosition || "UNKNOWN").toUpperCase();
      const l = lanes.get(lane) ?? { games: 0, wins: 0 };
      l.games += 1; l.wins += s.win ? 1 : 0;
      lanes.set(lane, l);
    }

    const totalGames = slices.length;
    const ver = await getLatestDDragonVersion();

    const champions = Array.from(champs.values()).map((c) => ({
      name: c.name,
      games: c.games,
      wins: c.wins,
      winRate: Math.round((c.wins / Math.max(1, c.games)) * 1000) / 10,
      icon: championIcon(ver, c.name),
    }));

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

    return Response.json({
      meta: {
        riotId: `${account.gameName}#${account.tagLine}`,
        puuid: account.puuid.slice(0,8) + "…",
        cluster, year: parsed.year, queues, totalGames,
        generatedAt: new Date().toISOString()
      },
      champions, lanes: lanesArr, topUsed, topWinRate, bestLane,
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

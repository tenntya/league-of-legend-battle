import { NextRequest } from "next/server";
import { z } from "zod";
import {
  getAccountByRiotId,
  detectCluster,
  listMatchIds,
  getPlayerSlice,
  getLatestDDragonVersion,
  championIcon,
  type Cluster,
} from "@/lib/riot";

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
  const encoder = new TextEncoder();
  const { searchParams } = new URL(req.url);
  let parsed: z.infer<typeof Query>;
  try {
    parsed = Query.parse({
      riotId: searchParams.get("riotId"),
      year: searchParams.get("year"),
      queues: searchParams.get("queues"),
      cluster: searchParams.get("cluster"),
      limit: searchParams.get("limit"),
    });
  } catch (e) {
    return new Response("Bad Request", { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        if (!process.env.RIOT_API_KEY) {
          send({ type: "error", error: "server_misconfigured" });
          controller.close();
          return;
        }
        const rawQueues = parsed.queues ?? process.env.DEFAULT_QUEUES ?? "";
        const queues = rawQueues
          .split(",")
          .map((x) => x.trim())
          .filter((x) => x.length > 0)
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x));

        const { start, end } = yearRangeJST(parsed.year);

        send({ type: "phase", phase: "account_lookup" });
        const account = await getAccountByRiotId(parsed.riotId);
        const cluster: Cluster = parsed.cluster ?? (await detectCluster(account.puuid, account.tagLine));
        send({ type: "meta", meta: { riotId: `${account.gameName}#${account.tagLine}`, cluster, year: parsed.year, queues } });

        send({ type: "phase", phase: "listing_ids" });
        const ids = await listMatchIds(cluster, account.puuid, start, end, queues, parsed.limit);
        send({ type: "ids", total: ids.length });

        const slices: { championName: string; win: boolean; teamPosition: string | null; patch?: string | null }[] = [];
        const champs = new Map<string, { games: number; wins: number; name: string }>();
        const lanes = new Map<string, { games: number; wins: number }>();
        const champLaneCount = new Map<string, Map<string, number>>();
        const champPatchCount = new Map<string, Map<string, number>>();

        const concurrency = 8;
        const startedAt = Date.now();
        for (let i = 0; i < ids.length; i += concurrency) {
          const chunk = ids.slice(i, i + concurrency);
          const results = await Promise.all(chunk.map((id) => getPlayerSlice(cluster, id, account.puuid)));
          for (const r of results) if (r) {
            slices.push(r);
            const c = champs.get(r.championName) ?? { games: 0, wins: 0, name: r.championName };
            c.games += 1; c.wins += r.win ? 1 : 0;
            champs.set(r.championName, c);
            const laneKey = (r.teamPosition || "UNKNOWN").toUpperCase();
            const l = lanes.get(laneKey) ?? { games: 0, wins: 0 };
            l.games += 1; l.wins += r.win ? 1 : 0;
            lanes.set(laneKey, l);

            const lm = champLaneCount.get(r.championName) ?? new Map<string, number>();
            lm.set(laneKey, (lm.get(laneKey) ?? 0) + 1);
            champLaneCount.set(r.championName, lm);
            if (r.patch) {
              const pm = champPatchCount.get(r.championName) ?? new Map<string, number>();
              pm.set(r.patch, (pm.get(r.patch) ?? 0) + 1);
              champPatchCount.set(r.championName, pm);
            }
          }

          const processed = Math.min(i + concurrency, ids.length);
          // 軽量の部分スナップショットを送る
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
            winRate: Math.round((v.wins / Math.max(1, v.games)) * 1000) / 10,
          }));
          const topUsed = [...champions].sort((a,b)=>b.games-a.games).slice(0,10);
          const topWinRate = [...champions].filter(c=>c.games>=5).sort((a,b)=>b.winRate-a.winRate).slice(0,10);
          send({
            type: "progress",
            processed,
            total: ids.length,
            snapshot: {
              meta: { riotId: `${account.gameName}#${account.tagLine}` },
              champions: topUsed, // 軽量の一部
              lanes: lanesArr.slice(0,5),
              topWinRate,
              elapsedMs: Date.now() - startedAt,
            },
          });
        }

        // 完了スナップ
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
          winRate: Math.round((v.wins / Math.max(1, v.games)) * 1000) / 10,
        }));
        const topUsed = [...champions].sort((a,b)=>b.games-a.games).slice(0,10);
        const topWinRate = [...champions].filter(c=>c.games>=5).sort((a,b)=>b.winRate-a.winRate).slice(0,10);
        const laneThreshold = 10;
        const eligibleLanes = lanesArr.filter(l => l.games >= laneThreshold).sort((a,b)=>b.winRate-a.winRate);
        const bestLane = eligibleLanes[0]?.lane || "UNKNOWN";

        send({ type: "done", result: {
          meta: {
            riotId: `${account.gameName}#${account.tagLine}`,
            puuid: account.puuid.slice(0,8) + "…",
            cluster, year: parsed.year, queues, totalGames: slices.length,
            generatedAt: new Date().toISOString()
          },
          champions, lanes: lanesArr, topUsed, topWinRate, bestLane
        }});
      } catch (e: any) {
        send({ type: "error", error: e?.message || "unknown_error" });
      } finally {
        controller.close();
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

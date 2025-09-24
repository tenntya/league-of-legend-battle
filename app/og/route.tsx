import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const riotId = searchParams.get("riotId") || "Riot ID";
  const year = searchParams.get("year") || new Date().getFullYear().toString();
  const bestLane = searchParams.get("bestLane") || "-";
  const top = searchParams.get("top") || ""; // name:games:wr,name:games:wr
  const debug = searchParams.get("debug");

  const items = top
    ? top.split(",").slice(0, 3).map((s) => {
        const [name, games, wr] = s.split(":");
        return { name, games, wr };
      })
    : [] as { name: string; games: string; wr: string }[];

  if (debug) {
    return new Response(JSON.stringify({ riotId, year, bestLane, items }, null, 2), { headers: { "content-type": "application/json" } });
  }

  try {
    return new ImageResponse(
      (
        <div style={{ height: '100%', width: '100%', position: 'relative', background: 'linear-gradient(135deg, #0b1020 0%, #111827 60%, #1f2937 100%)' }}>
          <div style={{ position: 'absolute', top: 48, left: 48, width: 24, height: 24, borderRadius: 12, background: '#60a5fa', boxShadow: '0 0 24px rgba(96,165,250,0.6)' }} />
          <div style={{ position: 'absolute', bottom: 48, left: 48, right: 48, height: 4, background: '#34d399' }} />
        </div>
      ),
      { width: 1200, height: 630 }
    );
  } catch (e: any) {
    return new Response(`og_error: ${e?.message || e}`, { status: 500, headers: { "content-type": "text/plain" } });
  }
}

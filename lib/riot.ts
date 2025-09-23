const ACCOUNT_HOSTS = ["americas", "asia", "europe"] as const;
const MATCH_HOSTS = ["americas", "asia", "europe"] as const;

export type Cluster = typeof MATCH_HOSTS[number];

type RiotAccount = { puuid: string; gameName: string; tagLine: string };
type RiotMatchId = string;

export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---- Simple in-memory TTL cache / LRU-ish prune ----
type CacheEntry<V> = { v: V; exp: number; last: number };
class TTLCache<K, V> {
  private m = new Map<any, CacheEntry<V>>();
  private max: number;
  constructor(max = 1000) { this.max = max; }
  get(key: K): V | undefined {
    const e = this.m.get(this.k(key)) as CacheEntry<V> | undefined;
    if (!e) return undefined;
    if (Date.now() > e.exp) { this.m.delete(this.k(key)); return undefined; }
    e.last = Date.now();
    return e.v;
  }
  set(key: K, v: V, ttlMs: number) {
    if (this.m.size > this.max) this.prune();
    this.m.set(this.k(key), { v, exp: Date.now() + ttlMs, last: Date.now() });
  }
  private prune() {
    const arr = Array.from(this.m.entries()) as [any, CacheEntry<V>][];
    arr.sort((a, b) => a[1].last - b[1].last);
    const remove = Math.ceil(arr.length * 0.2);
    for (let i = 0; i < remove; i++) this.m.delete(arr[i][0]);
  }
  private k(key: K) { return JSON.stringify(key); }
}

const accountCache = new TTLCache<any, any>(200);
const clusterCache = new TTLCache<any, any>(500);
const idsCache = new TTLCache<any, any>(500);
const matchCache = new TTLCache<any, any>(2000);
let ddragonVerCached: { ver: string; exp: number } | null = null;

async function fetchRiot(url: string, init?: RequestInit, attempt = 0): Promise<Response> {
  // Timeout + backoff + keep no-store
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 10000); // 10s
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "X-Riot-Token": process.env.RIOT_API_KEY!,
        ...(init?.headers || {}),
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After") || "1");
      if (attempt < 5) { await sleep(retryAfter * 1000); return fetchRiot(url, init, attempt + 1); }
    }
    return res;
  } finally {
    clearTimeout(to);
  }
}

export async function getAccountByRiotId(riotId: string): Promise<RiotAccount> {
  const [name, tag] = riotId.split("#");
  if (!name || !tag) throw new Error("invalid_riot_id");
  const cacheKey = { name, tag };
  const hit = accountCache.get(cacheKey);
  if (hit) return hit as RiotAccount;
  let lastErr: any;
  for (const host of ACCOUNT_HOSTS) {
    try {
              const res = await fetchRiot(`https://${host}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
              if (res.ok) {
                const acc = (await res.json()) as RiotAccount;
                accountCache.set(cacheKey, acc, 1000 * 60 * 15); // 15min
                return acc;
              }
              if (res.status === 401 || res.status === 403) throw new Error("unauthorized");
              if (res.status === 404) throw new Error("not_found");
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("account_lookup_failed");
}

export async function detectClusterByPuuid(puuid: string): Promise<Cluster> {
  const ck = { t: "cluster", puuid };
  const ch = clusterCache.get(ck);
  if (ch) return ch as Cluster;
  for (const host of MATCH_HOSTS) {
    const url = `https://${host}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=1`;
    const res = await fetchRiot(url);
    if (!res.ok) continue;
    try {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) { clusterCache.set(ck, host, 1000 * 60 * 30); return host; }
    } catch (_) {
      // ignore parse errors and try next host
    }
  }
  throw new Error("cluster_detect_failed");
}

export function clusterFromTagLine(tag: string | undefined | null): Cluster | null {
  if (!tag) return null;
  const t = tag.toUpperCase();
  const AMERICAS = new Set(["NA1", "BR1", "LA1", "LA2", "OC1", "NA", "BR", "LAN", "LAS", "OCE"]);
  const EUROPE = new Set(["EUW1", "EUN1", "TR1", "RU", "EUW", "EUNE", "TR", "RU"]);
  const ASIA = new Set(["JP1", "KR", "SG2", "PH2", "TW2", "TH2", "VN2", "JP", "KR1"]);
  if (AMERICAS.has(t)) return "americas";
  if (EUROPE.has(t)) return "europe";
  if (ASIA.has(t)) return "asia";
  return null;
}

export async function detectCluster(puuid: string, tagLine?: string): Promise<Cluster> {
  const guess = clusterFromTagLine(tagLine);
  if (guess) return guess;
  try {
    return await detectClusterByPuuid(puuid);
  } catch {
    // 最後の手段として asia を返す（JP/KR など東アジア向けの一般的既定）
    return "asia";
  }
}

export async function listMatchIds(
  host: Cluster,
  puuid: string,
  startTime: number,
  endTime: number,
  queues: number[],
  limit = Infinity
): Promise<RiotMatchId[]> {
  const ck = { host, puuid, startTime, endTime, queues: [...queues].sort(), limit };
  const cached = idsCache.get(ck);
  if (cached) return cached as RiotMatchId[];
  const ids: RiotMatchId[] = [];
  let start = 0;
  const qs = (s: number) =>
    `start=${s}&count=100&startTime=${startTime}&endTime=${endTime}` +
    (queues.length ? `&queue=${queues.join("&queue=")}` : "");
  while (true) {
    const res = await fetchRiot(
      `https://${host}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?${qs(start)}`
    );
    if (!res.ok) break;
    const batch = (await res.json()) as string[];
    ids.push(...batch);
    if (ids.length >= limit) break;
    if (batch.length < 100) break;
    start += 100;
    if (ids.length > 3000) break; // 安全弁
  }
  const out = ids.slice(0, Number.isFinite(limit) ? limit : undefined);
  idsCache.set(ck, out, 1000 * 60 * 10); // 10min
  return out;
}

export type PlayerSlice = { championName: string; win: boolean; teamPosition: string | null };
export async function getPlayerSlice(host: Cluster, matchId: string, puuid: string): Promise<PlayerSlice | null> {
  const ck = { matchId, puuid };
  const ch = matchCache.get(ck);
  if (ch) return ch as PlayerSlice;
  const res = await fetchRiot(`https://${host}.api.riotgames.com/lol/match/v5/matches/${matchId}`);
  if (!res.ok) return null;
  const data = await res.json();
  const p = data?.info?.participants?.find((x: any) => x.puuid === puuid);
  if (!p) return null;
  const val = { championName: p.championName, win: Boolean(p.win), teamPosition: p.teamPosition || p.individualPosition || null } as PlayerSlice;
  matchCache.set(ck, val, 1000 * 60 * 30); // 30min
  return val;
}

export async function getLatestDDragonVersion(): Promise<string> {
  if (ddragonVerCached && Date.now() < ddragonVerCached.exp) return ddragonVerCached.ver;
  const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json", { cache: "no-store" });
  const arr = (await res.json()) as string[];
  const ver = arr[0];
  ddragonVerCached = { ver, exp: Date.now() + 1000 * 60 * 60 }; // 1h
  return ver;
}

export function championIcon(ver: string, championName: string) {
  return `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${encodeURIComponent(championName)}.png`;
}

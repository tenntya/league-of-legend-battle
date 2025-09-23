export type Champ = { name: string; games: number; wins: number; winRate: number };
export type Lane = { lane: string; games: number; wins: number; winRate: number };

export function analyzeSeason(args: {
  meta: { year: number; totalGames: number };
  champions: Champ[];
  lanes: Lane[];
}) {
  const { meta, champions, lanes } = args;
  const total = meta.totalGames;

  const topByUse = [...champions].sort((a, b) => b.games - a.games)[0];
  const topByWin = [...champions]
    .filter((c) => c.games >= 5)
    .sort((a, b) => b.winRate - a.winRate)[0];

  const bestLane = [...lanes]
    .filter((l) => l.games >= 10)
    .sort((a, b) => b.winRate - a.winRate)[0];

  const overallWin = Math.round(
    (champions.reduce((acc, c) => acc + c.wins, 0) / Math.max(1, total)) * 1000
  ) / 10;

  const summaryParts: string[] = [];
  summaryParts.push(`総試合数は ${total}、推定総合勝率は ${overallWin}% です。`);
  if (topByUse)
    summaryParts.push(`使用数が最も多いのは ${topByUse.name}（${topByUse.games}試合）。`);
  if (topByWin)
    summaryParts.push(
      `5試合以上で勝率が最も高いのは ${topByWin.name}（${topByWin.winRate}%）。`
    );
  if (bestLane)
    summaryParts.push(
      `レーンは ${bestLane.lane} が好成績（${bestLane.games}試合で勝率 ${bestLane.winRate}%）。`
    );

  const bullets: string[] = [];
  if (topByUse && topByUse.winRate < 50)
    bullets.push(
      `${topByUse.name} は使用数に対して勝率が伸びていません。別の主力候補の併用を検討しましょう。`
    );
  if (bestLane && bestLane.winRate >= 55)
    bullets.push(
      `得意レーンのランク/ノーマル選択やロール申請を優先して、勝率の底上げを狙えます。`
    );
  if (total < 30)
    bullets.push(`サンプルが少なめです。評価の安定化には 30〜50 試合以上が目安です。`);

  return {
    summary: summaryParts.join(" "),
    bullets,
  };
}


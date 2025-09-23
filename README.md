# LoL 年間サマリー（NoDB / Vercel）
Riot ID を入力して、今年のチャンピオン使用数・勝率・得意レーンを可視化する Next.js（App Router）MVP。**DB不要**、**Riot API を都度叩いて集計**します。

## セットアップ
1) 依存のインストール  
   ```bash
   npm i
   ```
2) 環境変数  
   `.env.local` を作成し、以下を設定：
   ```
   RIOT_API_KEY=<YourRiotApiKey>
   DEFAULT_QUEUES=420,440
   RIOT_LANG=ja_JP
   ```
3) 開発サーバ  
   ```bash
   npm run dev
   ```

## デプロイ（Vercel）
- 初回：`vercel` でプロジェクトをリンク → `vercel --prod`
- 環境変数は Vercel の「Project Settings → Environment Variables」に設定  
  - `RIOT_API_KEY`（必須）
  - `DEFAULT_QUEUES`（例: `420,440`）
  - `RIOT_LANG`（例: `ja_JP`）

## 注意事項
- 本リポジトリは**個人の年間戦績を解析**します。Riot の開発者ポリシー／レート制限を遵守してください。
- **429** の場合は自動バックオフしていますが、過度な並列取得は避けています。
- **広告・PR表記**はユーザーに明確に分かるように表示してください。
- 画像・名称は Data Dragon を利用します。パッチ更新に伴う差分が出る場合があります。


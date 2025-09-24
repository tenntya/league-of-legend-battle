"use client";
import { useToast } from "@/components/Toast";

export default function ShareButtons({ getUrl, text }: { getUrl: () => string; text?: string }) {
  const { show } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(getUrl());
      show("リンクをコピーしました", "success");
    } catch {
      show("コピーに失敗しました", "error");
    }
  }
  function shareX() {
    const url = encodeURIComponent(getUrl());
    const body = encodeURIComponent(text || "LoL 年間サマリー");
    // Prefer x.com; add fallback when popup is blocked
    const href = `https://x.com/intent/tweet?text=${body}&url=${url}`;
    const w = window.open(href, "_blank", "noopener,noreferrer");
    if (!w) {
      // Popup blocked: navigate current tab
      window.location.href = href;
    }
  }
  return (
    <div className="flex gap-2">
      <button onClick={copy} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-label transition-soft">リンクをコピー</button>
      <button onClick={shareX} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-label transition-soft">X で共有</button>
    </div>
  );
}

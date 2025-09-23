"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Toast = { id: number; type?: "info" | "success" | "error"; message: string };
type ToastCtx = { show: (msg: string, type?: Toast["type"]) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, number>());

  const remove = useCallback((id: number) => {
    setToasts((arr) => arr.filter((x) => x.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback((message: string, type: Toast["type"] = "info") => {
    // 重複抑制（同一メッセージ・タイプは追加しない）
    let shouldAdd = true;
    setToasts((arr) => {
      if (arr.some((x) => x.message === message && x.type === type)) {
        shouldAdd = false;
        return arr;
      }
      const t: Toast = { id: Date.now() + Math.random(), type, message };
      // 最大3件に制限（古いものから削除）
      const next = [...arr.slice(Math.max(0, arr.length - 2)), t];
      // 自動クローズのタイマー
      const id = window.setTimeout(() => remove(t.id), 3500);
      timers.current.set(t.id, id);
      return next;
    });
    if (!shouldAdd) return;
  }, [remove]);
  const value = useMemo(() => ({ show }), [show]);

  // ESC キーで最新のトーストを閉じる
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && toasts.length > 0) {
        remove(toasts[toasts.length - 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toasts, remove]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed top-3 right-3 z-[100] space-y-2">
        {toasts.map((t) => (
          <button
            onClick={() => remove(t.id)}
            key={t.id}
            className={`text-left px-3 py-2 rounded-lg text-sm border shadow-lg backdrop-blur-md transition-opacity hover:opacity-90 ${
            t.type === "success" ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-100" :
            t.type === "error" ? "bg-red-500/20 border-red-400/30 text-red-100" :
            "bg-neutral-900/70 border-white/10 text-neutral-100"
          }`}
            aria-label="通知を閉じる"
          >
            {t.message}
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("ToastProvider missing");
  return ctx;
}

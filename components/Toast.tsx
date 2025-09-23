"use client";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Toast = { id: number; type?: "info" | "success" | "error"; message: string };
type ToastCtx = { show: (msg: string, type?: Toast["type"]) => void };

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const show = useCallback((message: string, type: Toast["type"] = "info") => {
    const t: Toast = { id: Date.now() + Math.random(), type, message };
    setToasts((arr) => [...arr, t]);
    setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== t.id)), 3500);
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="fixed top-3 right-3 z-[100] space-y-2">
        {toasts.map((t) => (
          <div key={t.id} className={`px-3 py-2 rounded-lg text-sm border shadow-lg backdrop-blur-md ${
            t.type === "success" ? "bg-emerald-500/20 border-emerald-400/30 text-emerald-100" :
            t.type === "error" ? "bg-red-500/20 border-red-400/30 text-red-100" :
            "bg-neutral-900/70 border-white/10 text-neutral-100"
          }`}>{t.message}</div>
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


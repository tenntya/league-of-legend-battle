"use client";
import React from "react";

type Action = { label: string; onClick: () => void };

export default function EmptyState({
  title = "データが見つかりません",
  message = "条件を少し変えて、もう一度お試しください。",
  actions = [],
  variant = "empty",
}: {
  title?: string;
  message?: string;
  actions?: Action[];
  variant?: "empty" | "sparse";
}) {
  return (
    <div
      className="flex items-center justify-center text-center px-4 py-10 rounded-2xl bg-neutral-950/40 ring-1 ring-white/10"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-xl">
        <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-brand-primary">
          {variant === "empty" ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 3l9 6v6l-9 6-9-6V9l9-6z" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 13c3-1 7-1 10 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <h3 className="text-h3 font-medium text-neutral-100">{title}</h3>
        <p className="text-small text-neutral-400 mt-1">{message}</p>
        {actions.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {actions.map((a, i) => (
              <button
                key={i}
                onClick={a.onClick}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-label transition-soft"
              >
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


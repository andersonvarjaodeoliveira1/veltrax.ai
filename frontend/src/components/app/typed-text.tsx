"use client";

import { useEffect, useState } from "react";

/** Mostra o texto "digitando", com um cursor roxo piscando. Sem movimento para quem prefere menos animação. */
export function TypedText({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(text.length); return; }
    setShown(0);
    const step = Math.max(2, Math.ceil(text.length / 120));
    const timer = window.setInterval(() => {
      setShown((current) => {
        const next = Math.min(text.length, current + step);
        if (next >= text.length) window.clearInterval(timer);
        return next;
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [text]);

  const done = shown >= text.length;
  return <p className={`${className ?? ""}${done ? "" : " gt-typing"}`} aria-label={text}>{text.slice(0, shown)}</p>;
}

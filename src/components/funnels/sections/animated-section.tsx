"use client";

import { useEffect, useRef, useState } from "react";
import type { AnimationLevel } from "@/lib/funnels/design-strategy";

/**
 * Restrained, performance-safe reveal-on-scroll wrapper — Phase 2's
 * animation system. Pure CSS transition (opacity + a small translateY),
 * triggered once via IntersectionObserver (no scroll listeners, no
 * per-frame work). `prefers-reduced-motion: reduce` disables all motion
 * via a CSS media query, not a JS branch, so it can never be missed.
 *
 * "none" renders children directly (no wrapper overhead at all) — the
 * right choice for conservative/accessibility-sensitive archetypes.
 */
const LEVEL_CONFIG: Record<Exclude<AnimationLevel, "none">, { translateY: number; durationMs: number; delayStepMs: number }> = {
  minimal: { translateY: 8, durationMs: 500, delayStepMs: 0 },
  moderate: { translateY: 16, durationMs: 600, delayStepMs: 60 },
  expressive: { translateY: 28, durationMs: 700, delayStepMs: 90 },
};

export function AnimatedSection({
  level,
  index,
  children,
}: {
  level: AnimationLevel;
  /** Section index — used to stagger moderate/expressive reveals slightly,
   *  capped so a long page doesn't develop a multi-second delay tail. */
  index: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(level === "none");

  useEffect(() => {
    if (level === "none" || !ref.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [level]);

  if (level === "none") return <>{children}</>;

  const cfg = LEVEL_CONFIG[level];
  const delayMs = Math.min(index, 4) * cfg.delayStepMs;

  return (
    <div
      ref={ref}
      className="motion-reduce:!opacity-100 motion-reduce:!translate-y-0"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : `translateY(${cfg.translateY}px)`,
        transition: `opacity ${cfg.durationMs}ms ease-out ${delayMs}ms, transform ${cfg.durationMs}ms ease-out ${delayMs}ms`,
      }}
    >
      {children}
    </div>
  );
}

import { useEffect, useState } from "react";
import type { CountdownConfig } from "@/types/funnels";

function timeLeft(endsAt: string): { d: number; h: number; m: number; s: number; done: boolean } {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, done: true };
  const s = Math.floor(ms / 1000);
  return {
    d: Math.floor(s / 86_400),
    h: Math.floor((s % 86_400) / 3_600),
    m: Math.floor((s % 3_600) / 60),
    s: s % 60,
    done: false,
  };
}

export function CountdownSection({
  config,
  accentColor,
}: {
  config: CountdownConfig;
  accentColor: string;
}) {
  const [left, setLeft] = useState<ReturnType<typeof timeLeft> | null>(null);

  useEffect(() => {
    setLeft(timeLeft(config.endsAt));
    const t = setInterval(() => setLeft(timeLeft(config.endsAt)), 1000);
    return () => clearInterval(t);
  }, [config.endsAt]);

  if (!left) return null;
  if (left.done && config.onExpireBehavior === "hide") return null;

  const units: [string, number][] = [
    ["days", left.d],
    ["hrs", left.h],
    ["min", left.m],
    ["sec", left.s],
  ];

  return (
    <div
      className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white"
      style={{ backgroundColor: accentColor }}
    >
      {units.map(([label, value]) => (
        <span key={label} className="tabular-nums">
          {String(value).padStart(2, "0")}
          <span className="ml-0.5 font-normal opacity-80">{label}</span>
          {label !== "sec" && <span className="mx-1.5 opacity-60">·</span>}
        </span>
      ))}
    </div>
  );
}

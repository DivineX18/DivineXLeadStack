"use client";

import { useEffect, useState } from "react";

/**
 * The shared fix for a bug class found repeatedly during final QA
 * certification (2026-10-28): a component reads Date.now(), or formats a
 * timestamp with toLocaleString()/toLocaleDateString()/toLocaleTimeString()
 * (unqualified, so it uses the CALLER's locale and timezone), directly
 * during render. The server and a real visitor's browser disagree on
 * BOTH of those things -- a different timezone/locale for a formatted
 * date, and a different real elapsed time for anything computed from
 * Date.now() -- and React throws hydration error #418 on the mismatched
 * text. This reproduces reliably on a real deployment and NEVER on a
 * local dev/production server tested against itself, which is exactly
 * why five separate instances of it (flow-dashboard.tsx,
 * intelligence-status-badge.tsx, members-directory.tsx, feed-view.tsx,
 * and the ones this hook now replaces) survived to live QA undetected.
 *
 * Usage: call this ONCE per component (never inside a .map() loop -- it's
 * a hook), and pass the returned `now` into plain, pure formatting
 * functions alongside each item's own timestamp. `now` is `null` during
 * SSR and the client's first paint (so the server and the client's FIRST
 * render agree: nothing time/locale-dependent is shown yet), then becomes
 * a real number after mount. Every formatter in this app that takes `now`
 * should treat `null` as "not ready" and return a neutral placeholder
 * (usually "").
 *
 *   const now = useHydrationSafeNow();
 *   // ...
 *   {items.map((item) => <span key={item.id}>{formatRelative(now, item.ms)}</span>)}
 *
 * Pass `intervalMs` only for a value that should keep advancing on
 * screen (a live "5m ago" -> "6m ago" ticker, a countdown). Omit it for a
 * value that's fine computed once after mount (a message timestamp, a
 * "joined" date) -- the common case, and cheaper.
 */
export function useHydrationSafeNow(intervalMs?: number): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    if (!intervalMs) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

"use client";

import { useEffect, useRef } from "react";
import { trackFunnelEvent, type FunnelEvent, type FunnelEventProps } from "@/lib/analytics/track";

/**
 * Fires one funnel event when a server-rendered page mounts.
 *
 * The acquisition pages are server components, and a page view is a client
 * fact, so this is the smallest possible client boundary: no markup, no
 * styling, no layout impact. Mount it and it reports once.
 *
 * Guarded against React's development double-invoke of effects so a single
 * visit is never counted twice.
 */
export function FunnelPageView({ event, ...props }: { event: FunnelEvent } & FunnelEventProps) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    trackFunnelEvent(event, props);
    // Deliberately mount-only: the props are page-constant, and re-firing on a
    // prop identity change would inflate the count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

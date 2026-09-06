"use client";

import { useEffect } from "react";

import { FUNNEL_SUBMIT_EVENT } from "@/lib/funnels/telemetry-events";

/**
 * FUNNEL TRACKER — the visitor-side half of funnel measurement.
 *
 * Measured in the browser rather than in the server render on purpose: a
 * server render also counts crawlers, link-preview fetchers and Next's own
 * prefetches, which would inflate every number and make "views" a lie. What
 * this counts is a real browser that actually rendered the page.
 *
 * Mounted inside PublicFunnelView and suppressed under previewMode, so the
 * public page and custom-domain page are both instrumented from ONE place and
 * the draft preview stays unmeasured — matching the existing preview-safety
 * contract (no real leads, no automations, no production analytics).
 *
 * Submissions are observed via a DOM event the public form dispatches AFTER
 * its own API call succeeds, rather than being threaded through five layers of
 * section props. The event fires only on a real success, so the count tracks
 * real captures.
 */

const SESSION_KEY = "dx_funnel_session";

function sessionState(): { isFirst: boolean } {
  try {
    const seen = sessionStorage.getItem(SESSION_KEY);
    if (seen) return { isFirst: false };
    sessionStorage.setItem(SESSION_KEY, "1");
    return { isFirst: true };
  } catch {
    // Private mode / storage blocked. Counting the view but not the session is
    // the honest degradation: views stay right, sessions under-report rather
    // than over-report.
    return { isFirst: false };
  }
}

function signals() {
  const p = new URLSearchParams(window.location.search);
  const g = (k: string) => p.get(k) || undefined;
  return {
    referrer: document.referrer || undefined,
    utmSource: g("utm_source"),
    utmMedium: g("utm_medium"),
    utmCampaign: g("utm_campaign"),
    gclid: g("gclid"),
    fbclid: g("fbclid"),
  };
}

function send(funnelId: string, payload: Record<string, unknown>) {
  const body = JSON.stringify(payload);
  const url = `/api/lp/${funnelId}/track`;
  try {
    // sendBeacon survives the page being closed mid-request — the common case
    // for a bounce, which is exactly the visit you least want to lose.
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* fall through to fetch */
  }
  void fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function FunnelTracker({ funnelId }: { funnelId: string }) {
  useEffect(() => {
    const { isFirst } = sessionState();
    send(funnelId, { kind: "view", firstInSession: isFirst, ...signals() });

    const onSubmit = () => send(funnelId, { kind: "submission", ...signals() });
    window.addEventListener(FUNNEL_SUBMIT_EVENT, onSubmit);
    return () => window.removeEventListener(FUNNEL_SUBMIT_EVENT, onSubmit);
  }, [funnelId]);

  return null;
}

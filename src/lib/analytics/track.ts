/**
 * ACQUISITION FUNNEL EVENTS — one thin push onto the GTM dataLayer.
 *
 * Not a second analytics platform. `AnalyticsScripts` already loads GTM when
 * NEXT_PUBLIC_GTM_ID is set; this is the vocabulary that rides it, so the
 * tracking side can build GA4/Ads conversions off clean named events without a
 * code change. The Ascend BI app pushes a bare `scan_completed` the same way
 * (artifacts/divinex/src/lib/analytics.ts), so the two surfaces speak one
 * language.
 *
 * SAFE WHEN ANALYTICS IS OFF. `dataLayer` is created if absent and pushed to
 * regardless, so events queue harmlessly and nothing throws when GTM never
 * loads. Every call is wrapped: an analytics failure must never break a
 * checkout, a scan, or a page.
 *
 * WHAT MAY NEVER BE SENT. No email, no website URL, no scan findings, no
 * business names, no score values, no diagnosis text. The properties below are
 * a closed set of low-cardinality strings chosen so the funnel is analysable
 * without any of the customer's data leaving with it. `scan_status` carries
 * lifecycle only ("started"/"completed"/"failed"), never a result.
 */

export type FunnelEvent =
  | "ascend_home_viewed" // A
  | "growth_scan_cta_clicked" // B
  | "growth_scan_started" // C
  | "growth_scan_completed" // D
  | "growth_scan_results_viewed" // E
  | "trial_cta_clicked" // F
  | "start_page_viewed" // G
  | "checkout_started" // H
  | "trial_activated" // I
  | "paid_conversion" // J
  // Guided product tour. Lifecycle only — which tour, which version, which
  // step. Never anything the customer typed or the product computed.
  | "tour_started"
  | "tour_step_viewed"
  | "tour_skipped"
  | "tour_completed"
  | "tour_restarted";

export interface FunnelEventProps {
  /** "ascend" | "flow" — which product surface the visitor is on. */
  product?: string;
  /** Where the action was taken from ("hero", "results", "pricing"). Never a URL. */
  source?: string;
  /** Plan identifier for checkout/trial events. An id, never a price. */
  plan?: string;
  /** Scan lifecycle only: "started" | "completed" | "failed". Never a result. */
  scan_status?: string;
  /** Which tour, e.g. "flow-only" | "flow-operations". */
  tour_id?: string;
  /** Tour version as a string, so it stays low-cardinality in reporting. */
  tour_version?: string;
  /** Which product experience the tour is explaining. */
  experience?: string;
  /** Anchor id of the step, e.g. "nav-contacts". Chosen by this code, never
   *  by a customer. */
  step_id?: string;
}

/** Properties are allow-listed by KEY, so a caller cannot widen the payload by
 *  passing extra fields, and by TYPE, so an object can never be smuggled in. */
const ALLOWED: (keyof FunnelEventProps)[] = [
  "product", "source", "plan", "scan_status",
  "tour_id", "tour_version", "experience", "step_id",
];

export function trackFunnelEvent(event: FunnelEvent, props: FunnelEventProps = {}): void {
  if (typeof window === "undefined") return;
  try {
    const payload: Record<string, string> = {};
    for (const key of ALLOWED) {
      const v = props[key];
      // Strings only, length-capped: nothing free-form, nothing large, and no
      // accidental object/PII passthrough.
      if (typeof v === "string" && v) payload[key] = v.slice(0, 60);
    }
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ...payload });
  } catch {
    // Analytics is never allowed to break the thing it is measuring.
  }
}

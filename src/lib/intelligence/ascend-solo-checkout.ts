import "server-only";

/**
 * ONE COMMERCIAL ASCEND SOLO SUBSCRIPTION, OWNED BY BI.
 *
 * Ascend Solo existed twice: as BI's `growth_system` product, and as a Flow
 * Client Billing plan with `product: "unified"` at the same $197. They were
 * independent subscriptions in independent billing systems, and only the BI
 * one grants `growth_intelligence` + `growth_operations` — which is what
 * drives workspace provisioning, the canonical mapping and the Operations SSO
 * handoff. A customer who bought the Flow one paid $197 and reached none of
 * it.
 *
 * BI is now the canonical owner, so the Ascend `/start` surface hands off
 * here. The presentation stays Flow-side; only the purchase moves.
 *
 * This deliberately uses BI's EXISTING public self-serve checkout — the same
 * endpoint the Ascend pricing page already used — rather than introducing a
 * second way to create a subscription. Price, trial length, trial settings and
 * entitlement grants are whatever that contract already says; nothing about
 * them is restated or overridden here.
 */

/**
 * THE ASCEND SOLO OFFER — ONE CONTRACT FOR BOTH DISPLAY AND PURCHASE.
 *
 * `/start` used to read its price and trial length from Flow's legacy
 * `unified` Client Billing plan while buying something else entirely, so the
 * page showed one product's numbers and charged another's. That is exactly
 * how a display and a checkout drift apart unnoticed.
 *
 * These values mirror BI's canonical `PRODUCTS.growth_system`
 * (`defaultAmount: 19700`) and `TRIAL_DAYS_BY_PRODUCT.growth_system` (14).
 * They are restated here rather than fetched because `/start` is a
 * cold-traffic page and a cross-service call on it would make the front door
 * fail whenever the intelligence service hiccups — a worse failure than the
 * one being fixed.
 *
 * Restating carries a divergence risk, so it is PINNED BY TEST: the
 * acquisition suite asserts these numbers against BI's own source, and CI
 * fails if either side moves without the other. BI remains the authority;
 * this is a mirror with an alarm on it, not a second source of truth.
 */
export const ASCEND_SOLO_OFFER = {
  /** The canonical BI product this page sells. */
  product: "growth_system",
  name: "Ascend Solo",
  priceMonthlyCents: 19_700,
  currency: "usd",
  trialDays: 14,
} as const;

/** The BI service base. Already includes the `/api` prefix (see render.yaml). */
function baseUrl(): string | null {
  const raw = process.env.ASCEND_INTELLIGENCE_API_URL;
  return raw ? raw.replace(/\/$/, "") : null;
}

export function ascendSoloCheckoutConfigured(): boolean {
  return !!baseUrl();
}

export type AscendCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string };

/**
 * Start the canonical Ascend Solo ($197, 14-day card-required trial)
 * subscription for a visitor who has not signed in yet.
 *
 * `product` is fixed to `growth_system` in this module rather than accepted
 * as an argument: this is the Ascend Solo path, and a caller must not be able
 * to nominate a different product through it.
 */
export async function startAscendSoloCheckout(input: {
  email: string;
  name?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<AscendCheckoutResult> {
  const base = baseUrl();
  if (!base) {
    return { ok: false, status: 503, error: "Ascend checkout isn't configured on this deployment yet." };
  }

  let res: Response;
  try {
    res = await fetch(`${base}/stripe/checkout/public`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        ...(input.name ? { name: input.name } : {}),
        product: ASCEND_SOLO_OFFER.product,
        successPath: input.successUrl,
        cancelPath: input.cancelUrl,
      }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return { ok: false, status: 502, error: "Couldn't reach checkout. Try again in a moment." };
  }

  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) {
    // Surface BI's own message when it gave one — those are written for the
    // customer (e.g. payments not configured) — but never a raw error page.
    return {
      ok: false,
      status: res.status === 503 ? 503 : 502,
      error: body?.error?.trim() || "Couldn't start your trial. Try again in a moment.",
    };
  }
  return { ok: true, url: body.url };
}

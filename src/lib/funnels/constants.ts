/** Stripe Checkout Session metadata.kind — the string-constant dispatch
 *  pattern already used by SUB_ACCOUNT_PLAN_KIND / QUOTE_INVOICE_PAYMENT_KIND
 *  (src/lib/stripe/webhooks.ts, src/lib/quotes/stripe-payment.ts). Kept even
 *  though the tenant webhook route only ever sees funnel-checkout events
 *  today, for forward-compatibility and consistent idempotent-replay tests. */
export const FUNNEL_ORDER_KIND = "funnelOrder";

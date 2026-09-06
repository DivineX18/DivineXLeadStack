/**
 * ASK ZENO — the one way any surface hands work to the assistant.
 *
 * The gap this closes: intelligence produced recommendations that rendered as
 * prose and stopped there. A customer read "your hero doesn't state a specific
 * outcome" and had nowhere to go with it. The loop visibly broke at exactly
 * the point the product claims as its differentiator.
 *
 * A DOM event rather than a context provider, because the launcher lives in
 * the shell and the surfaces that need it (server-rendered intelligence cards,
 * the editor, Home) are scattered across the tree and mostly server
 * components. This keeps the coupling to a single string.
 *
 * DELIBERATELY SEEDS, NEVER SENDS. The request lands in the input for the
 * customer to read, edit or ignore. Nothing is generated, changed or spent
 * until they choose to send it — so opening the panel and closing it again
 * leaves the account exactly as it was.
 *
 * NEVER A DEAD END. The floating launcher is not always rendered: it gates on
 * a resolved workspace and a client-side read of the AI-suite gate, and when
 * either is unavailable it renders nothing — so the event had no listener in a
 * rendered state and the click silently did nothing (found in staging
 * acceptance, on a real login). A recommendation that offers an action must
 * always lead somewhere, so the launcher now ACKNOWLEDGES the event only when
 * it can actually open, and anything unacknowledged falls back to the Ask Zeno
 * page carrying the same request. The handoff is preserved either way.
 */
export const ASK_ZENO_EVENT = "divinex:ask-zeno";

export interface AskZenoDetail {
  /** The request, phrased as the customer would say it. */
  prompt: string;
  /** Optional artifact the request concerns, so Zeno reasons about the real
   *  draft rather than regenerating from a title. */
  artifactRef?: { kind: "funnel"; id: string; sectionId?: string | null };
  /** Set to true by the launcher when it is actually able to open. Left false
   *  when it rendered nothing, which is the signal to fall back. */
  handled?: boolean;
}

/** Where an unhandled request goes. The same page the sidebar's "Ask Zeno"
 *  entry opens, so the fallback is a surface the customer already knows. */
export const ZENO_PAGE_PATH = "/zeno";

/** URLs are not an unbounded transport, and a recommendation can be long. Long
 *  enough to carry the whole ask in practice, short enough to stay well inside
 *  what every browser and proxy accepts. */
const MAX_SEEDED_PROMPT = 1200;

export function askZeno(detail: AskZenoDetail): void {
  if (typeof window === "undefined") return;

  // Mutable so a listener can acknowledge it. Dispatch is synchronous, so by
  // the time this returns the flag is final.
  const payload: AskZenoDetail = { ...detail, handled: false };
  window.dispatchEvent(new CustomEvent<AskZenoDetail>(ASK_ZENO_EVENT, { detail: payload }));
  if (payload.handled) return;

  // Nothing could open the panel here. Hand the request to the Zeno page
  // rather than letting the click do nothing.
  const ask = detail.prompt.slice(0, MAX_SEEDED_PROMPT);
  window.location.href = `${ZENO_PAGE_PATH}?ask=${encodeURIComponent(ask)}`;
}

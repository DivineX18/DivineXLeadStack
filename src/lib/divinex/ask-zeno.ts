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
 */
export const ASK_ZENO_EVENT = "divinex:ask-zeno";

export interface AskZenoDetail {
  /** The request, phrased as the customer would say it. */
  prompt: string;
  /** Optional artifact the request concerns, so Zeno reasons about the real
   *  draft rather than regenerating from a title. */
  artifactRef?: { kind: "funnel"; id: string; sectionId?: string | null };
}

export function askZeno(detail: AskZenoDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AskZenoDetail>(ASK_ZENO_EVENT, { detail }));
}

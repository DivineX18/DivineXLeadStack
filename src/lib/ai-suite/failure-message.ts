/**
 * WHAT THE CUSTOMER IS TOLD WHEN ZENO CANNOT ANSWER.
 *
 * They were being shown "Request failed (502)". That is a status code from a
 * provider they have never heard of, about a service they do not know exists,
 * and it answers neither question that actually matters to them: what went
 * wrong, and did anything change?
 *
 * TRUTHFULNESS ABOUT STATE IS THE WHOLE POINT. "Nothing was changed" is a
 * claim, and a wrong one is worse than silence: it sends someone off believing
 * their workspace is untouched when a write may have half-landed. So the
 * message is derived from WHERE the failure happened:
 *
 *   A chat turn never writes. The assistant reads, thinks and proposes; every
 *   change waits for the customer to confirm it. So a failed turn genuinely
 *   changed nothing, and saying so is safe.
 *
 *   A confirm IS the write. A refusal before the work starts (4xx) changed
 *   nothing. An unexpected fault during it (5xx) might have changed something
 *   and might not, and the honest answer is to say exactly that rather than
 *   guess in either direction.
 *
 * No provider name, no model name, no status code in the sentence. The code
 * still travels in the logs, where whoever has to fix it is looking.
 */

/** Where the failure happened, which is what decides what may be claimed. */
export type ZenoFailureStage =
  /** A conversational turn. Reads and proposals only, never a write. */
  | "chat"
  /** Executing a change the customer confirmed. */
  | "confirm";

export interface ZenoFailure {
  status: number;
  stage: ZenoFailureStage;
  /** The server's own `{ error }`, when it sent one worth reading. */
  serverMessage?: string | null;
}

/**
 * A sentence to show the customer. Prefers the server's own wording, which
 * throughout this codebase is written for them, and only falls back to a
 * status-derived one when there is nothing better.
 */
export function describeZenoFailure({ status, stage, serverMessage }: ZenoFailure): string {
  const fromServer = typeof serverMessage === "string" ? serverMessage.trim() : "";
  // A server message that is itself a bare code is no better than the code.
  const usable = fromServer && !/^(request|action) failed/i.test(fromServer) ? fromServer : "";

  const stateNote =
    stage === "chat"
      ? "Nothing was changed."
      : status >= 500
        ? // The one case where certainty is not available. Saying "nothing was
          // changed" here would be a guess presented as a fact.
          "I'm not certain whether that change went through, so check it before trying again."
        : "Nothing was changed.";

  if (usable) return `${usable} ${stateNote}`;

  if (status === 401) return "Your session expired, so I couldn't do that. Sign in again and ask me once more. Nothing was changed.";
  if (status === 403) return `You don't have permission to do that in this workspace. ${stateNote}`;
  if (status === 404) return `I couldn't find what that refers to any more. ${stateNote}`;
  if (status === 429) return `That's more than I can handle at once. Give it a moment and ask me again. ${stateNote}`;
  if (status === 502 || status === 503 || status === 504) {
    return `I couldn't finish that because Zeno's intelligence service didn't respond. ${stateNote} Please try again in a moment.`;
  }
  if (status >= 500) return `Something went wrong on our side while I was working on that. ${stateNote}`;
  return `I couldn't do that. ${stateNote}`;
}

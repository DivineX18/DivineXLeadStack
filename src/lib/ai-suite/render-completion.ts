import type { CustomerCompletion } from "@/lib/ai-suite/capabilities";

/**
 * Render the ONE authoritative customer-facing completion message — U1.
 *
 * Deliberately dumb and total: it can only emit the three fields of a
 * CustomerCompletion. It has no access to the funnel document, the capability
 * args, the design strategy, the Director plan or the Critic verdict, so
 * there is no path by which an internal detail could reach the customer
 * through this function. That is the point: the boundary is enforced by what
 * this function CAN see, not by what it remembers to strip.
 *
 * Structure is fixed — Outcome, then Review when there is something to
 * review, then the next action — so the customer gets the same shape from
 * every capability rather than whatever prose a model composed that turn.
 */
export function renderCompletion(c: CustomerCompletion): string {
  const parts: string[] = [c.outcome.trim()];

  if (c.review.length > 0) {
    parts.push(c.review.map((r) => `• ${r.trim()}`).join("\n"));
  }

  if (c.nextActions.length > 0) {
    // The first action is the recommended one; the rest are alternatives.
    const [first, ...rest] = c.nextActions;
    // Labels are used VERBATIM. An earlier version lowercased the
    // alternatives to make them read as a sentence, which turned "Keep going
    // with Zeno" into "keep going with zeno" — lowercasing a proper noun in
    // customer-facing prose. Labels are authored correctly; leave them alone.
    parts.push(
      rest.length > 0
        ? `${first.label} when you're ready — or: ${rest.map((a) => a.label).join(" · ")}`
        : `${first.label} when you're ready.`,
    );
  }

  return parts.join("\n\n");
}

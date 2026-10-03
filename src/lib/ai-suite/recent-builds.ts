import "server-only";
import { getAdminDb } from "@/lib/firebase/admin";
import type { AiSuiteKnowledgeCard } from "@/types/ai-suite";

/**
 * WHAT ZENO JUST BUILT, WITH THE IDS IT NEEDS TO REFERENCE IT.
 *
 * A multistep journey is linked by passing the DOWNSTREAM funnel's id as the
 * upstream page's `bridge_next_funnel_id`. create_funnel's receipt ends with
 * exactly that instruction and the new id. But the receipt is the MODEL's
 * copy, and the confirm route deliberately withholds it from the client
 * (U1, the customer response boundary): it carries raw ids and internal
 * parameter names that must never reach a customer's screen.
 *
 * The chat client builds the model's history out of what it received, so
 * withholding the receipt from the customer also withheld it from the model.
 * The instruction "pass the exact Funnel ID returned by the earlier call"
 * was addressed to something that had been structurally prevented from
 * seeing one, and every multistep journey came out as unlinked pages.
 *
 * Reading the ids back from the audit trail instead keeps BOTH properties:
 * the model learns what it created, and nothing internal crosses the network
 * to the browser. It is also sturdier than threading an id through
 * conversation history, which a page reload or a trimmed thread loses.
 *
 * Deliberately narrow: only this workspace, only things that were really
 * created, only recently, and only the handful a journey could plausibly
 * reference.
 */

/** Only kinds a later step can actually be pointed at. */
// booking_page belongs here for two reasons: its ref id IS the slug that
// cta_booking_page_slug wants, and without it the model cannot tell it
// already made one, so "yes, continue" produced a second booking page.
const REFERENCEABLE = new Set(["funnel", "form", "workflow", "booking_page"]);
const LOOKBACK_MS = 6 * 60 * 60 * 1000;
const MAX_ITEMS = 8;

export async function renderRecentBuildsCard(
  subAccountId: string | null,
): Promise<AiSuiteKnowledgeCard | null> {
  if (!subAccountId) return null;
  try {
    const snap = await getAdminDb()
      .collection("aiSuiteActions")
      .where("subAccountId", "==", subAccountId)
      .where("status", "==", "executed")
      .get();

    const cutoff = Date.now() - LOOKBACK_MS;
    const rows = snap.docs
      .map((d) => {
        const x = d.data() as {
          capability?: string;
          summary?: string;
          resultRef?: { kind: string; id: string } | null;
          createdAt?: { toMillis?: () => number };
        };
        return { ...x, at: x.createdAt?.toMillis?.() ?? 0 };
      })
      .filter((x) => x.resultRef && REFERENCEABLE.has(x.resultRef.kind) && x.at >= cutoff)
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_ITEMS);

    if (rows.length === 0) return null;

    const lines = rows.map((r) => {
      // The summary names the thing; the id is what a later call needs.
      const name = (r.summary ?? "").replace(/^Create a DRAFT\s*/i, "").split(" with headline")[0].trim();
      if (r.resultRef!.kind === "booking_page") {
        // Named as a slug, because that is the parameter it feeds.
        return `- booking page, slug "${r.resultRef!.id}"${name ? `, ${name}` : ""}`;
      }
      return `- ${r.resultRef!.kind} ${r.resultRef!.id}${name ? `, ${name}` : ""}`;
    });

    return {
      id: "recent-builds",
      levels: ["sub-account"],
      title: "What you have already built in this workspace (recent)",
      location: "This workspace",
      keywords: ["funnel", "journey", "step", "link", "connect", "multistep", "assessment"],
      body: [
        "These were created in this workspace in the last few hours, newest first:",
        ...lines,
        "",
        "USE THESE IDS. When the customer asked for a multistep journey and you are now creating an UPSTREAM step, pass the downstream funnel's id above as bridge_next_funnel_id so the pages are actually connected. To link two that already exist, call link_funnel_steps. NEVER invent or guess an id, and never pass a placeholder: a wrong id is refused and nothing is created. If a booking page is listed above, pass its slug as cta_booking_page_slug instead of creating another one. If anything you were about to build is already in this list, do not build it again.",
      ].join("\n"),
    };
  } catch {
    // Best-effort context. A read failure must never block the turn.
    return null;
  }
}

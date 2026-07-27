// Stub — see publish/README.md. This route (and lib/github/invite.ts, which
// it depends on) is remnant infrastructure from the original LeadStack
// template SELLER's own founders/repo-access purchase funnel — not part of
// a buyer's deployed product. It has no live trigger here: nothing in this
// codebase's real customer flow (Client Billing v1, /signup) points at it.
// notFound() rather than a placeholder string, matching /buy/page.tsx's
// existing behavior for the same category of stub.
import { notFound } from "next/navigation";

export default function Page() {
  notFound();
}

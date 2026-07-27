// Stub — see publish/README.md. Same category as /buy and /thank-you: the
// original LeadStack template seller's own affiliate program for referring
// template buyers, not a feature of this deployment. notFound() rather than
// a placeholder string, matching /buy/page.tsx's existing behavior.
import { notFound } from "next/navigation";

export default function Page() {
  notFound();
}

import { redirect } from "next/navigation";

/** P0.3 — Brand is no longer a peer destination. Brand context is part of
 *  what Ascend knows about the business, so it lives under Intelligence. */
export default function LegacyBrandPage() {
  redirect("/app/intelligence/brand");
}

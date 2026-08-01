import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadFunnelForRender } from "@/lib/funnels/load-funnel-for-render";
import { PublicFunnelView } from "@/components/funnels/public-funnel-view";
import type { CustomDomainDoc } from "@/types/custom-domains";

export const dynamic = "force-dynamic";

/**
 * Internal resolver — never linked to directly. Reached only via the
 * middleware's hostname rewrite (see customDomainRewrite() in
 * middleware.ts), which sends any request whose Host header isn't this
 * app's own domain here, keeping the client's real domain in the browser's
 * address bar the whole time (rewrite, not redirect). A domain maps to
 * exactly ONE funnel at its root — [[...rest]] is caught and ignored so any
 * path on the client's domain renders the same funnel.
 */
export default async function CustomDomainResolverPage({
  params,
}: {
  params: Promise<{ hostname: string; rest?: string[] }>;
}) {
  const { hostname } = await params;

  const domainSnap = await getAdminDb().doc(`customDomains/${hostname}`).get();
  if (!domainSnap.exists) notFound();
  const domainDoc = domainSnap.data() as CustomDomainDoc;
  if (domainDoc.status !== "verified") notFound();

  const data = await loadFunnelForRender(domainDoc.funnelId);
  if (!data) notFound();

  return <PublicFunnelView funnel={data.funnel} forms={data.forms} />;
}

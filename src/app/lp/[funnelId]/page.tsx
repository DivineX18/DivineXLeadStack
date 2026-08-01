import { notFound } from "next/navigation";
import { loadFunnelForRender } from "@/lib/funnels/load-funnel-for-render";
import { PublicFunnelView } from "@/components/funnels/public-funnel-view";

export const dynamic = "force-dynamic";

export default async function PublicFunnelPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  const data = await loadFunnelForRender(funnelId);
  if (!data) notFound();

  return <PublicFunnelView funnel={data.funnel} forms={data.forms} />;
}

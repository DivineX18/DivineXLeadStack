import { redirect } from "next/navigation";

/** P0.3 — the funnel editor moved into Create. */
export default async function LegacyCampaignFunnelPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  redirect(`/app/create/funnel/${funnelId}`);
}

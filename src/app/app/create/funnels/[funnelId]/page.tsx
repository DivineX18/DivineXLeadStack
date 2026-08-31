import { redirect } from "next/navigation";

/** P0.3 — the funnel editor path is /app/create/funnel/[id]. Old links keep
 *  working in one hop. */
export default async function LegacyCreateFunnelsPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  redirect(`/app/create/funnel/${funnelId}`);
}

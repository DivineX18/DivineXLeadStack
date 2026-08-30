import { redirect } from "next/navigation";

/**
 * Legacy preview route. Production Experience 2.0 consolidated on ONE
 * canonical preview (/preview/funnel/[funnelId]) which is tenant-checked
 * server-side and, unlike this route, renders with previewMode so a
 * preview can never create a real lead. Old links keep working.
 */
export default async function LegacyFunnelPreviewPage({
  params,
}: {
  params: Promise<{ subAccountId: string; funnelId: string }>;
}) {
  const { funnelId } = await params;
  redirect(`/preview/funnel/${funnelId}`);
}

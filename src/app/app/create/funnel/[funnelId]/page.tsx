import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { FunnelBuilder } from "@/components/funnels/funnel-builder";

/**
 * The funnel editor inside Create. FunnelBuilder is reused as-is (the
 * same prop-driven component /app/create/funnels/[funnelId] and
 * /sa/[id]/funnels/[funnelId] render) — one editor, three entry points.
 */
export default async function CreateFunnelEditorPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title="Create"
        description="Pick a workspace to edit this funnel."
        links={[]}
      />
    );
  }

  return <FunnelBuilder saId={saId} funnelId={funnelId} />;
}

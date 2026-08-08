import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { FunnelBuilder } from "@/components/funnels/funnel-builder";

/**
 * Ascend OS launch pass, Task B — the funnel editor, native to the Ascend
 * shell. FunnelBuilder is reused as-is (prop-driven: saId + funnelId, no
 * SubAccountContext dependency) — the exact same component the legacy
 * /sa/{id}/funnels/{funnelId} page renders, just resolving saId via the
 * Ascend shell context instead of useSubAccount(). That legacy route is
 * untouched and still works for CRM-only customers.
 */
export default async function AscendFunnelEditorPage({
  params,
}: {
  params: Promise<{ funnelId: string }>;
}) {
  const { funnelId } = await params;
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Funnel editor" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <FunnelBuilder saId={saId} funnelId={funnelId} />
    </div>
  );
}

import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { WorkflowsList } from "@/components/workflows/workflows-list";

/**
 * Ascend OS launch pass, Task E. The legacy workflows/page.tsx is just a
 * thin async wrapper resolving subAccountId from a Next.js route param and
 * handing it to WorkflowsList({saId}) — reused directly here rather than
 * importing the wrapper, since our workspace id comes from the Ascend
 * shell context instead of a [subAccountId] URL segment.
 */
export default async function AscendLaunchWorkflowsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Workflows" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <WorkflowsList saId={saId} />
    </div>
  );
}

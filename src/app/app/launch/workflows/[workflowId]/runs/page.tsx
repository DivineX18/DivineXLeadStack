import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { WorkflowRuns } from "@/components/workflows/workflow-runs";

/** Ascend OS launch pass, Task E. Same direct-component-reuse pattern as launch/workflows/page.tsx. */
export default async function AscendLaunchWorkflowRunsPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Workflow runs" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6 text-[var(--dx-text-primary)]">
      <WorkflowRuns saId={saId} workflowId={workflowId} />
    </div>
  );
}

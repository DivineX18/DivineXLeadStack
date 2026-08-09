import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import TasksPage from "@/app/(dashboard)/sa/[subAccountId]/tasks/page";

/**
 * Ascend OS launch pass, Task C — Tasks, native to the Ascend shell. Same
 * zero-fork reuse pattern as grow/contacts/page.tsx.
 */
export default async function AscendGrowTasksPage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Tasks" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <SubAccountProvider subAccountId={saId}>
        <TasksPage />
      </SubAccountProvider>
    </div>
  );
}

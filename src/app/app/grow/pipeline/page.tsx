import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import PipelinePage from "@/app/(dashboard)/sa/[subAccountId]/pipeline/page";

/**
 * Ascend OS launch pass, Task C — Pipeline, native to the Ascend shell.
 * Same zero-fork reuse pattern as grow/contacts/page.tsx — see that file's
 * doc comment for the full rationale. PipelinePage is the exact same
 * zero-argument component the legacy /sa/[id]/pipeline route renders.
 */
export default async function AscendGrowPipelinePage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Pipeline" description="No active workspace yet." links={[]} />;
  }

  return (
    <SubAccountProvider subAccountId={saId} inAscendShell>
      <PipelinePage />
    </SubAccountProvider>
  );
}

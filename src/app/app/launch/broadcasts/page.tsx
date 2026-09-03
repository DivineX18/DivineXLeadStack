import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import BroadcastsListPage from "@/app/(dashboard)/sa/[subAccountId]/broadcasts/page";

/** Ascend OS launch pass, Task E. Same zero-fork reuse pattern as grow/contacts/page.tsx. */
export default async function AscendLaunchBroadcastsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Broadcasts" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6 text-[var(--dx-text-primary)]">
      <SubAccountProvider subAccountId={saId} inAscendShell>
        <BroadcastsListPage />
      </SubAccountProvider>
    </div>
  );
}

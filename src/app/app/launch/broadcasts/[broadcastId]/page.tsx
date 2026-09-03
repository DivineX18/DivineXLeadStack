import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import BroadcastDetailPage from "@/app/(dashboard)/sa/[subAccountId]/broadcasts/[broadcastId]/page";

/**
 * Ascend OS launch pass, Task E. BroadcastDetailPage reads its broadcastId
 * via useParams() (resolves from THIS route's own [broadcastId] segment,
 * no threading needed) and subAccountId via useSubAccount() (supplied by
 * SubAccountProvider below) — same zero-fork reuse pattern throughout.
 */
export default async function AscendLaunchBroadcastDetailPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Broadcast" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6 text-[var(--dx-text-primary)]">
      <SubAccountProvider subAccountId={saId} inAscendShell>
        <BroadcastDetailPage />
      </SubAccountProvider>
    </div>
  );
}

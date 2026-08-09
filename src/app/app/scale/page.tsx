import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import SubAccountAiSuitePage from "@/app/(dashboard)/sa/[subAccountId]/ai-suite/page";

/**
 * Ascend OS launch pass, Task G — Scale, native to the Ascend shell.
 *
 * The confirmation-gated execution layer this task describes (a capability
 * registry, validate()/confirm-first writes, execution receipts) is
 * ALREADY BUILT — it's the existing workspace-level AI Suite/Zeno at
 * /sa/[id]/ai-suite (see src/lib/ai-suite/capabilities.ts). This is
 * deliberately reuse only, not a new execution bridge: same zero-fork
 * pattern as every other task in this pass. No permission/entitlement
 * check is duplicated here -- SubAccountAiSuitePage and the underlying
 * capability registry own that already.
 */
export default async function AscendScalePage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Scale" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <SubAccountProvider subAccountId={saId}>
        <SubAccountAiSuitePage />
      </SubAccountProvider>
    </div>
  );
}

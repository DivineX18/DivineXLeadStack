import type { ReactNode } from "react";
import { SubAccountProvider } from "@/context/sub-account-context";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

/**
 * UNIFIED FEATURE ADAPTER.
 *
 * The one piece of glue that lets a Complete customer use a Flow feature
 * without leaving the unified shell. Flow's feature pages are client
 * components that read useSubAccount(); this supplies that context around
 * them with `inAscendShell` set, so every saPath() link they render resolves
 * to its /app equivalent instead of bouncing to /sa/{id}.
 *
 * Deliberately an ADAPTER, not a re-implementation: the feature component,
 * its services, its Firestore access and its business logic are all still
 * Flow's. Only the shell and the link resolution differ.
 */
export default async function UnifiedFeature({
  children,
  title = "Workspace",
}: {
  children: ReactNode;
  title?: string;
}) {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;
  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title={title}
        description="Pick a workspace to see this."
        links={[]}
      />
    );
  }
  return (
    <SubAccountProvider subAccountId={saId} inAscendShell>
      {children}
    </SubAccountProvider>
  );
}

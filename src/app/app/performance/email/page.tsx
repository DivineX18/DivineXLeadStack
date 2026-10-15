import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { PageHeader } from "@/components/divinex/ui";
import { EmailActivityLog } from "@/components/email/email-activity-log";
import { SubAccountProvider } from "@/context/sub-account-context";

export const dynamic = "force-dynamic";

/**
 * PERFORMANCE -> Email. What the team sent, and what the recipient did.
 *
 * Exists because the log was built as a Flow sidebar entry, and the Flow
 * sidebar does not render in the Ascend shell at all — so from Ascend the
 * feature was invisible, the same way the traffic card was before it was
 * mounted onto Performance.
 *
 * Renders the SAME component as the Flow page rather than a second view of
 * the same collection, so the two shells cannot drift apart.
 */
export default async function AscendEmailLogPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;
  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title="Email"
        description="No active workspace yet."
        links={[]}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Link
        href="/performance"
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: "var(--dx-text-muted)" }}
      >
        <ArrowLeft className="h-3 w-3" /> Performance
      </Link>
      <PageHeader
        title="Email"
        description="Every email this workspace has sent, who sent it, and what the recipient did with it."
      />
      {/* The provider is REQUIRED: the log reads the active workspace via
          useSubAccount(), which THROWS when no provider is mounted, and a
          throw in a client component takes the whole page to the error
          boundary. `inAscendShell` also makes the log's internal links
          resolve to /app routes instead of yanking the operator back into
          Flow chrome. Same wrapper Performance uses for the Google card. */}
      <SubAccountProvider subAccountId={saId} inAscendShell>
        <EmailActivityLog variant="ascend" />
      </SubAccountProvider>
    </div>
  );
}

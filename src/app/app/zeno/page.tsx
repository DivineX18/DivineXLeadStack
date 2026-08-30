import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AiSuiteChat } from "@/components/ai-suite/ai-suite-chat";
import { getAdminDb } from "@/lib/firebase/admin";
import { PageHeader } from "@/components/divinex/ui";
import type { FunnelDoc } from "@/types/funnels";

export const dynamic = "force-dynamic";

/**
 * Zeno, inside the unified shell — PRODUCTION EXPERIENCE 2.0, Phase E.
 *
 * Zeno previously lived only at /sa/[id]/ai-suite, outside /app/*, so asking
 * for help meant leaving the product you were in and losing the surrounding
 * chrome. The chat component is reused as-is (prop-driven: level +
 * subAccountId); this route just resolves the workspace from shell context
 * the way every other /app page does. The legacy route is untouched and
 * still serves CRM-only customers.
 *
 * CONTEXTUAL ENTRY: `?funnel=<id>` is what "Continue with Zeno" on a funnel
 * row links to. Per the approved Phase B clarification this is deliberately
 * NOT a conversation-memory feature — it resolves the funnel's real name
 * server-side (tenancy-checked) and shows the operator which campaign they
 * arrived from, so the context is canonical rather than a replayed thread.
 */
export default async function ZenoPage({
  searchParams,
}: {
  searchParams: Promise<{ funnel?: string }>;
}) {
  const [{ funnel: funnelId }, shell] = await Promise.all([searchParams, resolveShellContextForPage()]);
  const workspaceId = shell?.workspace?.workspaceId ?? null;

  if (!workspaceId) {
    return (
      <AscendSectionPlaceholder
        title="Zeno"
        description="Pick a workspace and Zeno can start building in it."
        links={[]}
      />
    );
  }

  // Resolve the campaign name only when it genuinely belongs to this
  // workspace — a funnel id in the URL must never reveal another tenant's.
  let context: string | null = null;
  if (funnelId) {
    const snap = await getAdminDb().doc(`funnels/${funnelId}`).get();
    const data = snap.exists ? (snap.data() as Omit<FunnelDoc, "id">) : null;
    if (data && data.subAccountId === workspaceId) context = data.name ?? null;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
      <PageHeader
        title="Zeno"
        description={
          context
            ? `Working on “${context}”. Ask for a change, or start something new.`
            : "Ask for what you want built. Zeno drafts it, you review before anything goes live."
        }
      />
      <div className="min-h-[32rem] flex-1">
        <AiSuiteChat level="sub-account" subAccountId={workspaceId} />
      </div>
    </div>
  );
}

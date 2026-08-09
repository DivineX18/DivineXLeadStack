import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import SettingsPage from "@/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page";

/**
 * Ascend OS launch pass, Task D — Settings, native to the Ascend shell.
 * Same zero-fork reuse pattern as grow/contacts/page.tsx: SettingsPage is
 * the exact, unmodified zero-argument component the legacy
 * /sa/[id]/dashboard/settings route renders, wrapped in the same
 * SubAccountProvider context it already expects.
 *
 * Deliberately NOT hand-curating which of its ~20 sections show — each
 * section (branding, members, territories, SMS/Meta/Stripe/PayPal config,
 * API keys, webhooks, plan billing, etc.) already has its own role-based
 * visibility, the SAME gating a subAccountCollaborator vs. subAccountAdmin
 * sees today on the CRM-only surface. Reusing the canonical, already-
 * correct role checks rather than duplicating a second curation layer on
 * top — matches the instruction to reuse the canonical evaluator instead
 * of inventing a parallel one.
 */
export default async function AscendSettingsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Settings" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <SubAccountProvider subAccountId={saId}>
        <SettingsPage />
      </SubAccountProvider>
    </div>
  );
}

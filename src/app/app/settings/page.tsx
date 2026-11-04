import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendSectionPage } from "@/components/ascend/section-page";
import { SubAccountProvider } from "@/context/sub-account-context";
import SettingsPage from "@/app/(dashboard)/sa/[subAccountId]/dashboard/settings/page";

/**
 * SETTINGS — native to the Ascend shell. Same zero-fork reuse pattern as
 * grow/contacts/page.tsx: SettingsPage is the exact, unmodified
 * zero-argument component the legacy /sa/[id]/dashboard/settings route
 * renders, wrapped in the same SubAccountProvider context it already
 * expects.
 *
 * Deliberately NOT hand-curating which of its ~20 sections show — each
 * section (branding, members, territories, SMS/Meta/Stripe/PayPal config,
 * API keys, webhooks, plan billing, etc.) already has its own role-based
 * visibility, the SAME gating a subAccountCollaborator vs. subAccountAdmin
 * sees today on the CRM-only surface. Reusing the canonical, already-
 * correct role checks rather than duplicating a second curation layer.
 *
 * EXECUTION-ONLY BY DECISION, and the accompanying verifier pins it that
 * way. Every other lifecycle section answers "where do I stand"; Settings
 * answers "what is this configured to do", and a context or insights band
 * here would be padding invented to satisfy a shape. What it takes from the
 * primitive is the section header and the container width, so it stops
 * being the one page in the shell with neither. The header action is
 * suppressed: "Ask Zeno" belongs over a section with a decision in it, not
 * over a configuration form.
 */
export default async function AscendSettingsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Settings" description="No active workspace yet." links={[]} />;
  }

  return (
    <AscendSectionPage
      title="Settings"
      description="How this workspace is configured, who can reach it, and what it's connected to."
      action={null}
      bands={[
        {
          role: "execution",
          content: (
            <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6 text-[var(--dx-text-primary)]">
              <SubAccountProvider subAccountId={saId} inAscendShell>
                <SettingsPage />
              </SubAccountProvider>
            </div>
          ),
        },
      ]}
    />
  );
}

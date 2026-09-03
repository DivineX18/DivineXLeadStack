import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import ContactProfilePage from "@/app/(dashboard)/sa/[subAccountId]/contacts/[id]/page";

/**
 * Ascend OS — contact detail, native to the Ascend shell. Closes the most
 * common deep-link seam: clicking a contact from the mounted Contacts list
 * now stays in Ascend chrome instead of bouncing to the legacy Flow layout.
 *
 * ContactProfilePage reads its contact id via useParams<{ id }>() (resolves
 * from THIS route's own [id] segment) and subAccountId via useSubAccount()
 * (supplied by SubAccountProvider) — the same zero-fork reuse pattern every
 * other shell mount uses. The list links here because resolveAscendShellHref
 * maps /contacts/{id} -> /app/grow/contacts/{id} now that this route exists.
 */
export default async function AscendGrowContactDetailPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Contact" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6 text-[var(--dx-text-primary)]">
      <SubAccountProvider subAccountId={saId} inAscendShell>
        <ContactProfilePage />
      </SubAccountProvider>
    </div>
  );
}

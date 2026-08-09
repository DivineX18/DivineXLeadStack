import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import ContactsPage from "@/app/(dashboard)/sa/[subAccountId]/contacts/page";

/**
 * Ascend OS launch pass, Task C — Contacts, native to the Ascend shell.
 *
 * ContactsPage is the EXACT SAME component the legacy /sa/[id]/contacts
 * route renders — a zero-argument client component that pulls everything
 * (subAccountId, role, territories, etc.) from useSubAccount(). Rather than
 * forking its substantial internal logic (search, CSV export, bulk email/
 * call dialogs, territory filtering), this just supplies the same
 * SubAccountProvider context it already expects — SubAccountProvider is
 * itself route-agnostic (only needs a subAccountId prop, subscribes to
 * Firestore + useAuth() itself, renders no chrome of its own), so this is
 * a genuine zero-fork reuse, not a rebuild.
 *
 * Known scope boundary: internal navigation inside ContactsPage (e.g. a
 * contact's detail link, built via useSubAccount().saPath()) still points
 * at /sa/{id}/contacts/{id} — clicking into a specific contact's detail
 * page still deep-links to Flow branding for now, same accepted boundary
 * as Task B's funnel-orders link. The list/search/bulk-actions surface
 * itself is fully native.
 */
export default async function AscendGrowContactsPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Contacts" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <SubAccountProvider subAccountId={saId}>
        <ContactsPage />
      </SubAccountProvider>
    </div>
  );
}

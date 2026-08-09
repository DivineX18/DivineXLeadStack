import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { SubAccountProvider } from "@/context/sub-account-context";
import CalendarPage from "@/app/(dashboard)/sa/[subAccountId]/calendar/page";

/**
 * Ascend OS launch pass, Task C — Calendar, native to the Ascend shell.
 * Same zero-fork reuse pattern as grow/contacts/page.tsx.
 */
export default async function AscendGrowCalendarPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Calendar" description="No active workspace yet." links={[]} />;
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <SubAccountProvider subAccountId={saId}>
        <CalendarPage />
      </SubAccountProvider>
    </div>
  );
}

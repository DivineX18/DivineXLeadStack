import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendSettingsPage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Settings"
      description="A unified settings surface arrives in a future slice. Your workspace's existing settings pages are fully functional today."
      links={saId ? [{ label: "Open workspace settings", href: `/sa/${saId}/dashboard/settings` }] : []}
    />
  );
}

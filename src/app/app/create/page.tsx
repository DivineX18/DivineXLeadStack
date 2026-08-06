import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendCreatePage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Create"
      description="A native, unified builder surface arrives in a future slice. Today's proven Funnel Builder and Website Builder still live in your workspace."
      links={
        saId
          ? [
              { label: "Open Funnel Builder", href: `/sa/${saId}/funnels` },
              { label: "Open Website Builder", href: `/sa/${saId}/website` },
            ]
          : []
      }
    />
  );
}

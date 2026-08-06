import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendLaunchPage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Launch"
      description="A unified campaign-launch view arrives in a future slice. Broadcasts and Workflows are today's equivalent surfaces in your workspace."
      links={
        saId
          ? [
              { label: "Open Broadcasts", href: `/sa/${saId}/broadcasts` },
              { label: "Open Workflows", href: `/sa/${saId}/workflows` },
            ]
          : []
      }
    />
  );
}

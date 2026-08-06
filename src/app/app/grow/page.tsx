import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendGrowPage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Grow"
      description="A unified pipeline + relationship growth view arrives in a future slice. Pipeline is today's equivalent surface in your workspace."
      links={saId ? [{ label: "Open Pipeline", href: `/sa/${saId}/pipeline` }] : []}
    />
  );
}

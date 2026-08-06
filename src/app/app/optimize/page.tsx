import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendOptimizePage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Optimize"
      description="A unified optimization/CRO-audit view arrives in a future slice. Reports is today's equivalent surface in your workspace."
      links={saId ? [{ label: "Open reports", href: `/sa/${saId}/reports` }] : []}
    />
  );
}

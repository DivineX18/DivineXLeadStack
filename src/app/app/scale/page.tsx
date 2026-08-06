import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendScalePage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Scale"
      description="Recommendations and the Zeno execution bridge arrive in a future slice. Zeno is today's equivalent surface in your workspace."
      links={saId ? [{ label: "Ask Zeno", href: `/sa/${saId}/ai-suite` }] : []}
    />
  );
}

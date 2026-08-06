import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendIdentifyPage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Identify"
      description="Growth assessments and Business Memory — native Ascend Intelligence screens — arrive in a future slice. Reports is the closest existing view today."
      links={saId ? [{ label: "Open reports", href: `/sa/${saId}/reports` }] : []}
    />
  );
}

import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";

export default async function AscendHomePage() {
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  return (
    <AscendSectionPlaceholder
      title="Home"
      description="Your unified growth overview — operational + intelligence, composed — arrives in a future slice. For now, jump into your workspace dashboard."
      links={saId ? [{ label: "Open workspace dashboard", href: `/sa/${saId}/dashboard` }] : []}
    />
  );
}

import UnifiedFeature from "@/components/shell/unified-feature";
import FlowTemplateEditor from "@/app/(dashboard)/sa/[subAccountId]/templates/[templateId]/page";

/**
 * The message-template editor inside DivineX Complete.
 *
 * The segment is `[templateId]` to match the Flow editor's own
 * `useParams<{ templateId: string }>()`; renaming it would silently break the
 * lookup and the editor would sit on "not found".
 */
export default function Page() {
  return (
    <UnifiedFeature title="Template">
      <FlowTemplateEditor />
    </UnifiedFeature>
  );
}

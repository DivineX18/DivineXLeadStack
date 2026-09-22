import UnifiedFeature from "@/components/shell/unified-feature";
import FlowNewTemplate from "@/app/(dashboard)/sa/[subAccountId]/templates/new/page";

/** A new message template, inside the unified shell. */
export default function Page() {
  return (
    <UnifiedFeature title="New template">
      <FlowNewTemplate />
    </UnifiedFeature>
  );
}

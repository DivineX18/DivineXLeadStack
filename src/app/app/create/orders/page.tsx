import UnifiedFeature from "@/components/shell/unified-feature";
import FlowPage from "@/app/(dashboard)/sa/[subAccountId]/funnels/orders/page";

/**
 * Orders inside DivineX Complete — the SAME Flow page component, mounted in
 * the unified shell. No duplicated feature logic; see UnifiedFeature.
 */
export default function Page() {
  return (
    <UnifiedFeature title="Orders">
      <FlowPage />
    </UnifiedFeature>
  );
}

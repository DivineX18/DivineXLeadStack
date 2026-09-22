import UnifiedFeature from "@/components/shell/unified-feature";
import FlowQuoteDetail from "@/app/(dashboard)/sa/[subAccountId]/quotes/[id]/page";

/**
 * A quote or invoice opened inside DivineX Complete — the SAME Flow page
 * component, mounted in the unified shell, exactly as the Quotes index next
 * door. Without it, opening a quote dropped the operator into Flow's own
 * layout, sidebar and wordmark: the "feels like two apps" seam, appearing at
 * the moment someone is about to send a customer a price.
 *
 * `params` is handed straight through. The Flow page reads only `id`, so the
 * segment name must stay `[id]`.
 */
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <UnifiedFeature title="Quote">
      <FlowQuoteDetail params={params} />
    </UnifiedFeature>
  );
}

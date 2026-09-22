import UnifiedFeature from "@/components/shell/unified-feature";
import FlowNewBookingPage from "@/app/(dashboard)/sa/[subAccountId]/booking/new/page";

/** A new booking page, inside the unified shell. */
export default function Page() {
  return (
    <UnifiedFeature title="New booking page">
      <FlowNewBookingPage />
    </UnifiedFeature>
  );
}

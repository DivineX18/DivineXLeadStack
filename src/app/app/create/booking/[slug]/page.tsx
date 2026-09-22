import UnifiedFeature from "@/components/shell/unified-feature";
import FlowBookingPageEditor from "@/app/(dashboard)/sa/[subAccountId]/booking/[slug]/page";

/**
 * A booking page's settings inside DivineX Complete.
 *
 * The segment is `[slug]` to match the Flow editor's own `useParams()`. Note
 * the editor takes the WORKSPACE id from useSubAccount(), not from the route,
 * which is why it works unchanged under a path that has no `[subAccountId]`
 * segment — the public booking URL it displays is still the right one.
 */
export default function Page() {
  return (
    <UnifiedFeature title="Booking page">
      <FlowBookingPageEditor />
    </UnifiedFeature>
  );
}

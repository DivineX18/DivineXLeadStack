import UnifiedFeature from "@/components/shell/unified-feature";
import FlowFormEditor from "@/app/(dashboard)/sa/[subAccountId]/forms/[id]/page";

/**
 * The form EDITOR inside DivineX Complete — the same Flow page component,
 * mounted in the unified shell, exactly as the Forms index next door.
 *
 * Without this route, editing a form left Ascend entirely. The shell's link
 * table had `/forms` as a prefix, so `/forms/{id}` resolved to this path and
 * 404'd because only `page.tsx` existed here. Making `/forms` exact-match
 * stopped the 404 but sent the operator to `/sa/{id}/forms/{id}` — the legacy
 * Flow layout, complete with Flow's sidebar and wordmark. Working, but it is
 * the "feels like two apps" seam, and it appears at the moment someone is
 * building the thing their funnel depends on.
 *
 * The segment is `[id]` to match the Flow editor's own `useParams<{id}>()`;
 * renaming it would silently break the lookup.
 */
export default function Page() {
  return (
    <UnifiedFeature title="Form builder">
      <FlowFormEditor />
    </UnifiedFeature>
  );
}

import UnifiedFeature from "@/components/shell/unified-feature";
import FlowNewQuote from "@/app/(dashboard)/sa/[subAccountId]/quotes/new/page";

/**
 * Building a new quote inside DivineX Complete. The Flow page reads its
 * `contactId` / `kind` from the QUERY string, not the route, so it needs no
 * params plumbing — only the shell.
 */
export default function Page() {
  return (
    <UnifiedFeature title="New quote">
      <FlowNewQuote />
    </UnifiedFeature>
  );
}

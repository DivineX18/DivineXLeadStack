import { notFound } from "next/navigation";
import { loadFunnelForRender } from "@/lib/funnels/load-funnel-for-render";
import { PublicFunnelView } from "@/components/funnels/public-funnel-view";

export const dynamic = "force-dynamic";

export default async function PublicFunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ funnelId: string }>;
  searchParams: Promise<{ welcome?: string; from?: string }>;
}) {
  const { funnelId } = await params;
  const data = await loadFunnelForRender(funnelId);
  if (!data) notFound();

  // Multistep journey: a visitor who just signed up on the previous step
  // lands here directly (?welcome=1&from=<magnet funnel id>) instead of a
  // separate thank-you page — highest-converting bridge is no bridge, but
  // the visitor still needs to SEE that their signup landed, so a slim
  // confirmation bar carries the delivery note + the download link.
  const sp = await searchParams;
  let welcome: { magnetUrl?: string; magnetName?: string } | null = null;
  if (sp.welcome === "1") {
    welcome = {};
    if (sp.from && /^[A-Za-z0-9_-]{10,40}$/.test(sp.from)) {
      const source = await loadFunnelForRender(sp.from);
      if (source?.funnel.leadMagnetAsset) {
        welcome.magnetUrl = source.funnel.leadMagnetAsset.url;
        welcome.magnetName = source.funnel.leadMagnetAsset.filename;
      }
    }
  }

  const accent = data.funnel.accentColor || "#2563eb";

  return (
    <>
      {welcome && (
        <div
          className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 text-center text-sm font-semibold text-white"
          style={{ backgroundColor: accent }}
        >
          <span>
            ✓ You&apos;re in — {welcome.magnetUrl ? "your download is on its way to your email." : "check your email for everything you need."}
          </span>
          {welcome.magnetUrl && (
            <a
              href={welcome.magnetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 opacity-95 hover:opacity-100"
            >
              Download it now
            </a>
          )}
        </div>
      )}
      <PublicFunnelView funnel={data.funnel} forms={data.forms} />
    </>
  );
}

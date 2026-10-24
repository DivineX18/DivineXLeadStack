import "server-only";

import { renderToStream } from "@react-pdf/renderer";
import { AssetPdfDocument } from "@/lib/divinex/asset-pdf-document";

/** Same renderToStream -> Readable.toWeb bridge as lib/quotes/pdf-render.tsx —
 *  kept as its own small module rather than imported from quotes, since an
 *  asset PDF has nothing to do with billing and shouldn't depend on it. */
export async function renderAssetPdfStream({
  title,
  assetType,
  content,
}: {
  title: string;
  assetType: string;
  content: string;
}): Promise<ReadableStream<Uint8Array>> {
  const nodeStream = await renderToStream(
    <AssetPdfDocument title={title} assetType={assetType} content={content} />,
  );
  const { Readable } = await import("node:stream");
  return Readable.toWeb(
    nodeStream as unknown as InstanceType<typeof Readable>,
  ) as ReadableStream<Uint8Array>;
}

export function assetPdfFilename(title: string): string {
  const safe = title.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "asset";
  return `${safe}.pdf`;
}

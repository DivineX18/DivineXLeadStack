import type { Metadata } from "next";
import { readFunnelAssetMeta } from "@/lib/funnels/assets";
import { CUSTOM_BRAND } from "@/config/landing";

export const dynamic = "force-dynamic";

/**
 * THE BRANDED PLACE A RECIPIENT WATCHES OR LISTENS.
 *
 * A video or audio deliverable is referenced rather than uploaded (see
 * lib/funnels/delivery.ts), so sending the recipient straight at the file
 * would show them the provider's address, which is exactly what this whole
 * pass exists to stop. They come here instead: the brand's own domain, the
 * operator's title, and the thing they were promised playing.
 *
 * The asset id is the capability, the same model the download route has
 * always used: an unguessable Firestore auto-id that only reaches someone
 * because the email was sent to them. There is no login, deliberately. A
 * lead who just gave their address must not hit an authentication wall on
 * the way to the resource they were promised.
 *
 * It renders ONLY media. A downloadable asset is sent to the download route
 * instead, so this page can never be used to enumerate a workspace's images
 * or read a PDF it was not meant to serve.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ assetId: string }>;
}): Promise<Metadata> {
  const { assetId } = await params;
  const meta = /^[A-Za-z0-9]{10,40}$/.test(assetId) ? await readFunnelAssetMeta(assetId) : null;
  const title = meta?.title || meta?.filename || "Your resource";
  return {
    title: `${title} | ${CUSTOM_BRAND.name}`,
    // A delivery link is private to the person it was sent to.
    robots: { index: false, follow: false },
  };
}

export default async function DeliveryPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  const meta = /^[A-Za-z0-9]{10,40}$/.test(assetId) ? await readFunnelAssetMeta(assetId) : null;
  const playable = meta?.kind === "video" || meta?.kind === "audio";
  // Referenced media plays from its source; UPLOADED audio plays from the
  // branded route, which redirects to a signed, range-capable URL. Either
  // way the provider never appears here.
  const src = meta?.externalUrl ?? (meta?.storagePath ? `/api/funnel-asset/${assetId}` : null);

  if (!meta || !playable || !src) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 dark:bg-neutral-950">
        <div className="mx-auto w-full max-w-md text-center">
          <p className="text-sm font-semibold tracking-wide text-neutral-400 uppercase">
            {CUSTOM_BRAND.name}
          </p>
          <h1 className="mt-3 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            This link isn&apos;t available
          </h1>
          <p className="mt-3 text-neutral-600 dark:text-neutral-400">
            The resource may have been moved or replaced. Reply to the email you received and
            whoever sent it can get you a new link.
          </p>
        </div>
      </main>
    );
  }

  const title = meta.title || meta.filename || "Your resource";

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-10 dark:bg-neutral-950">
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-center text-sm font-semibold tracking-wide text-neutral-400 uppercase">
          {CUSTOM_BRAND.name}
        </p>
        <h1 className="mt-3 text-center text-2xl font-bold text-balance text-neutral-900 sm:text-3xl dark:text-neutral-50">
          {title}
        </h1>

        {meta.kind === "video" ? (
          <div className="mt-8 aspect-video overflow-hidden rounded-2xl bg-black shadow-[0_20px_60px_-15px_rgba(0,0,0,0.35)] ring-1 ring-black/5 dark:ring-white/10">
            {/* An embed (YouTube, Vimeo, Loom) renders in an iframe; a direct
                file plays natively. Both keep the provider's address out of
                the visible page. */}
            {isEmbed(src) ? (
              <iframe
                src={src}
                title={title}
                className="h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <video className="h-full w-full" controls preload="metadata" playsInline>
                <source src={src} />
              </video>
            )}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
            <audio className="w-full" controls preload="metadata">
              <source src={src} type={meta.contentType || undefined} />
            </audio>
            {meta.storagePath && (
              // Only an uploaded file can be handed over; a referenced one
              // is not ours to offer as a download.
              <p className="mt-4 text-center">
                <a
                  href={`/api/funnel-asset/${assetId}`}
                  download={meta.filename || "audio"}
                  className="text-sm font-medium text-teal-600 underline-offset-4 hover:underline dark:text-teal-400"
                >
                  Download audio
                </a>
              </p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Having trouble? Reply to the email you received and we&apos;ll help.
        </p>
      </div>
    </main>
  );
}

/** A watch/embed page rather than a media file. */
function isEmbed(url: string): boolean {
  return !/\.(mp4|webm|ogg|mov|m4v)(\?|$)/i.test(url);
}

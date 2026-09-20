/**
 * TWO URLS, ONE PICTURE.
 *
 * Deduplication compares URLs, which is correct until a CMS serves the same
 * photograph under several of them. WordPress — the source of most discovered
 * libraries — emits a family per upload:
 *
 *     .../image22.png
 *     .../image22-1024x562.png        (a generated size)
 *     .../image2-e1786899892158.png   (an edit revision)
 *     .../image4.png?ver=3            (a cache-buster)
 *
 * To a string comparison those are four assets. To a visitor they are one
 * picture appearing four times, which is precisely the failure dedupe exists
 * to prevent — and it evades every check silently, because each URL really is
 * distinct and really does resolve.
 *
 * So identity is the upload, not the URL. Query strings and fragments go
 * (they address delivery, not content), then the two suffix families
 * WordPress appends to a filename it is deriving from another.
 *
 * DELIBERATELY CONSERVATIVE. This only ever collapses names that differ by a
 * generated suffix; it does not stem, fuzzy-match, or compare image content.
 * Two genuinely different uploads that happen to look alike stay two assets,
 * because the cost of wrongly merging them is a page that silently drops an
 * image it was entitled to use.
 */

/** `-1024x562` immediately before the extension — a generated size variant. */
const SIZE_SUFFIX = /-\d{2,5}x\d{2,5}(?=\.[a-z0-9]+$)/i;
/** `-e1786899892158` immediately before the extension — an edit revision. */
const EDIT_SUFFIX = /-e\d{10,}(?=\.[a-z0-9]+$)/i;

/**
 * The stable identity of the asset a URL points at. Use this as the dedupe key
 * everywhere a page decides whether it has already shown a picture.
 *
 * Falls back to the trimmed input for anything unparseable, so a malformed URL
 * still compares equal to itself rather than collapsing with others.
 */
export function assetKey(url: string | null | undefined): string {
  if (typeof url !== "string") return "";
  const raw = url.trim();
  if (!raw) return "";

  let origin = "";
  let path = raw;
  try {
    const u = new URL(raw);
    origin = `${u.protocol}//${u.host}`;
    path = u.pathname;
  } catch {
    // Relative or malformed: strip the query/fragment by hand and carry on.
    path = raw.split("#")[0].split("?")[0];
  }

  const collapsed = path.replace(SIZE_SUFFIX, "").replace(EDIT_SUFFIX, "");
  return `${origin}${collapsed}`.toLowerCase();
}

/** True when two URLs address the same underlying upload. */
export function sameAsset(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = assetKey(a);
  const kb = assetKey(b);
  return ka !== "" && ka === kb;
}

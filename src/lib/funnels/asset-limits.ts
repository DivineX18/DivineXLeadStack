/**
 * Upload ceilings, in a module BOTH sides can import.
 *
 * These live apart from assets.ts because that file is `server-only` and
 * the builder's file picker needs the same numbers: the platform rejects an
 * oversized body before the route runs, so the only place a customer can be
 * told the file is too big is in the browser, before the upload starts.
 * One definition, so the two checks cannot disagree.
 */

/**
 * 4MB. RE-MEASURED against this deployment on 2026-10-04, because the
 * previous 5MB was above the real ceiling and therefore could not work.
 *
 * The earlier note recorded a cliff near 8.4MB. That is no longer true
 * here. Uploading MP3s of increasing size to production, with long gaps so
 * one rejection could not taint the next: 4MB, 4.25MB and 4.4MB were
 * accepted in about 4s; 4.6MB and 5MB came back as an HTML 502. The body is
 * rejected before any route runs, so nothing in this app can catch it or
 * explain it, which is why the builder also checks size before sending.
 *
 * So a 5MB limit promised a size the platform refuses: a PDF between 4.5
 * and 5MB passed our own check and then failed with "Unexpected token '<'".
 * 4MB sits under the measured cliff with margin, and matches
 * MAX_PRODUCT_FILE_BYTES, which was measured independently and agreed.
 */
export const MAX_ASSET_BYTES = 4 * 1024 * 1024;

/**
 * 4MB for audio too, for the same measured reason, not a preference.
 *
 * This was set to 8MB on the strength of the stale note above and did not
 * survive contact with production. The ceiling is the request body, and the
 * request body is capped at roughly 4.5MB whatever the file contains.
 *
 * What that buys for spoken word: about 8 minutes at 64kbps mono, 5.5 at
 * 96kbps, 4 at 128kbps stereo. A longer meditation does NOT fit and cannot
 * be made to by raising this number. It needs an upload that does not pass
 * through this server (client-direct to Storage), which this project tried
 * and abandoned when Storage-to-Firestore rule evaluation proved unreliable
 * across two buckets in two regions. That is a separate piece of work.
 */
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/**
 * 50MB for audio uploaded DIRECTLY to storage.
 *
 * The 4MB ceilings above exist because the file is proxied through this
 * server and the platform caps a request body at roughly 4.5MB. A direct
 * upload never touches this server, so that cap does not apply and the
 * limit becomes a judgement about cost instead: 50MB covers 30 minutes at
 * 192kbps, which is more than a guided meditation needs, while staying far
 * from anything that resembles video hosting.
 *
 * Storage is pennies; egress is the real cost and is bounded by how many
 * people claim the lead magnet, not by this number.
 */
export const MAX_AUDIO_DIRECT_BYTES = 50 * 1024 * 1024;

/** Audio this product accepts, shared by the picker and both upload paths. */
export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
] as const;

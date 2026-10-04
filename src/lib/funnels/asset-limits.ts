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
 * 5MB, and it is a MEASURED limit. The platform in front of this app
 * rejects bodies at roughly 8.4MB with an HTML 502 before any route runs;
 * 8MB uploaded in 18.6s, 9MB had the connection terminated. 5MB sits well
 * clear of that and uploads in about 11s. Raising it means measuring again.
 */
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/**
 * 8MB for audio, chosen against the same cliff rather than preference.
 *
 * Roughly 16 minutes of spoken word at 64kbps mono, 11 at 96kbps, 8 at
 * 128kbps stereo, which covers an ordinary guided meditation. It sits
 * closer to the ~8.4MB ceiling than MAX_ASSET_BYTES does, deliberately:
 * audio needs the room and a document does not. Anything beyond the cliff
 * cannot be fixed by raising this number, it needs an upload that does not
 * pass through this server.
 */
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

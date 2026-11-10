/**
 * Normalizes a `FIREBASE_ADMIN_PRIVATE_KEY`-shaped env var value into the
 * exact PEM text Node's crypto module (and therefore firebase-admin /
 * google-auth-library underneath it) requires.
 *
 * This codebase has always converted escaped `\n` sequences to real
 * newlines (the correct shape for a multi-line secret stuffed into a
 * single-line env var field). This adds a defense against a second, equally
 * common operator mistake: pasting the value straight out of a
 * `.env.local` file — including its surrounding double quotes, which are
 * `.env` file SYNTAX, not part of the key — into a platform's env var
 * field (Render, Vercel, …). A stray quote character immediately before
 * `-----BEGIN PRIVATE KEY-----` or after the final `-----END...-----`
 * breaks PEM parsing, and because the Admin SDK signs its own auth JWT
 * locally before ever reaching Google's servers, platforms that wrap that
 * failure generically can report it as something as unhelpful as
 * "gRPC 16 UNAUTHENTICATED: invalid authentication credentials" instead of
 * a clear "invalid PEM" error.
 *
 * A value that was already correctly formatted (no surrounding quotes, no
 * stray whitespace) comes back byte-for-byte equivalent — this only ever
 * strips characters that could never legally open or close a real PEM
 * value, so it cannot corrupt a key that was already valid.
 */
export function normalizeFirebasePrivateKey(
  raw: string | undefined,
): string | undefined {
  if (!raw) return raw;
  let value = raw.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (
      (first === '"' && last === '"') ||
      (first === "'" && last === "'")
    ) {
      value = value.slice(1, -1);
    }
  }
  return value.replace(/\\n/g, "\n");
}

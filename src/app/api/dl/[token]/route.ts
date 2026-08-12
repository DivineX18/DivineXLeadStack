import { NextResponse } from "next/server";
import { resolveProductDownload } from "@/lib/products/delivery";

export const dynamic = "force-dynamic";

/**
 * GET /api/dl/[token] — public digital-product download redirect.
 *
 * No auth — the HMAC-signed token IS the credential (same trust model as
 * /q/[token] and /u/[token]). Resolves to a fresh, short-lived Firebase
 * Storage signed URL and 302-redirects the browser straight to it, so
 * the buyer's browser downloads directly from Storage rather than
 * proxying the file bytes through this Next.js route (avoids serverless
 * body/timeout limits on large files entirely).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const result = await resolveProductDownload(token);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }
  return NextResponse.redirect(result.signedUrl, { status: 302 });
}

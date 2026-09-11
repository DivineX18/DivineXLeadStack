import { NextResponse } from "next/server";
import { normalizeReport, pollPublicGrowthScan } from "@/lib/intelligence/public-growth-scan";

export const dynamic = "force-dynamic";

/**
 * Read a public Growth Scan by its share token.
 *
 * The token IS the credential, the same model the public form and quote links
 * already use. Returns a narrowed report rather than the upstream document:
 * the raw payload carries internal diagnostic fields (decision traces,
 * reliability gates, blueprint scaffolding) that a cold visitor has no reason
 * to receive, and normalizing here keeps the client from reinterpreting a
 * shape it does not own.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  if (!token || token.length > 200) {
    return NextResponse.json({ state: "failed", error: "That scan link isn't valid." }, { status: 400 });
  }

  const result = await pollPublicGrowthScan(token);
  if (result.state === "ready") {
    return NextResponse.json({ state: "ready", report: normalizeReport(result.report) });
  }
  return NextResponse.json(result);
}

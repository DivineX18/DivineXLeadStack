import { NextResponse } from "next/server";

import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import { hashQuoteToken, verifyQuoteToken, buildQuoteUrl } from "@/lib/quotes/token";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { QUOTE_INVOICE_PAYMENT_KIND } from "@/lib/quotes/stripe-payment";
import type { Quote } from "@/types/quotes";
import type { SubAccountDoc } from "@/types/tenancy";

export const dynamic = "force-dynamic";

/**
 * POST /api/quotes/[token]/pay
 *
 * Recipient-facing endpoint hit by the "Pay with card" button on the
 * public invoice page. No auth — the token IS the credential, same
 * defense-in-depth as /api/quotes/[token]/respond (HMAC verification +
 * publicTokenHash comparison). Creates a one-time Stripe Checkout Session
 * against the AGENCY'S OWN Stripe account (see stripeInvoicesEnabled doc
 * comment on SubAccountDoc — no per-sub-account Connect) and returns the
 * session URL for the browser to redirect to. The session is created
 * fresh on every click rather than cached, since Checkout Sessions expire.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;

  const verified = verifyQuoteToken(token);
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or expired link" },
      { status: 404 },
    );
  }

  const db = getAdminDb();
  const quoteSnap = await db.collection("quotes").doc(verified.quoteId).get();
  if (!quoteSnap.exists) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }
  const quote: Quote = {
    id: quoteSnap.id,
    ...(quoteSnap.data() as Omit<Quote, "id">),
  };
  if (quote.publicTokenHash !== hashQuoteToken(token)) {
    return NextResponse.json(
      { error: "Invalid or expired link" },
      { status: 404 },
    );
  }
  if (quote.kind !== "invoice") {
    return NextResponse.json(
      { error: "Only invoices accept card payment" },
      { status: 400 },
    );
  }
  if (quote.status === "paid") {
    return NextResponse.json(
      { error: "This invoice has already been paid" },
      { status: 409 },
    );
  }

  const subSnap = await db.collection("subAccounts").doc(quote.subAccountId).get();
  const sub = subSnap.data() as SubAccountDoc | undefined;
  if (!sub?.stripeInvoicesEnabled) {
    return NextResponse.json(
      { error: "Card payment isn't enabled for this invoice" },
      { status: 503 },
    );
  }

  const totals = computeQuoteTotals(quote);
  if (totals.total <= 0) {
    return NextResponse.json(
      { error: "Invoice total must be greater than zero to pay by card" },
      { status: 400 },
    );
  }

  const publicUrl = buildQuoteUrl(token);
  if (!publicUrl) {
    return NextResponse.json(
      { error: "Payment isn't available on this deployment" },
      { status: 503 },
    );
  }

  try {
    const session = await getStripeServer().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: quote.currency.toLowerCase(),
            product_data: { name: `Invoice ${quote.quoteNumber}` },
            unit_amount: Math.round(totals.total * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        kind: QUOTE_INVOICE_PAYMENT_KIND,
        subAccountId: quote.subAccountId,
        quoteId: quote.id,
      },
      success_url: publicUrl,
      cancel_url: publicUrl,
    });
    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to start checkout" },
        { status: 502 },
      );
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[/api/quotes/[token]/pay] Stripe checkout create failed", err);
    return NextResponse.json(
      { error: "Failed to start checkout" },
      { status: 502 },
    );
  }
}

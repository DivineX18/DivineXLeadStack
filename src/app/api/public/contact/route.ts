import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { sendEmail, emailIsConfigured } from "@/lib/comms/resend";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { checkContactFormRateLimit } from "@/lib/public-contact-rate-limit";

/**
 * Public marketing contact form (/contact page). No auth — the honeypot +
 * per-IP rate limit are the abuse controls, same posture as
 * /api/forms/[id]/submit. Sends to the resolved brand's own support email
 * via the existing Resend wrapper — no new email provider, no new template
 * system.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok, retryAfterSec } = checkContactFormRateLimit(ip);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  if (!emailIsConfigured()) {
    return NextResponse.json(
      { error: "Contact form isn't configured on this deployment yet — email us directly." },
      { status: 503 },
    );
  }

  let body: { name?: string; email?: string; company?: string; message?: string; _confirm?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Honeypot — a real visitor never fills this hidden field.
  if (body._confirm) {
    return NextResponse.json({ ok: true });
  }

  const name = (body.name ?? "").trim().slice(0, 200);
  const email = (body.email ?? "").trim().slice(0, 320);
  const company = (body.company ?? "").trim().slice(0, 200);
  const message = (body.message ?? "").trim().slice(0, 5000);

  if (!name || !email || !message || !email.includes("@")) {
    return NextResponse.json({ error: "Name, a valid email, and a message are required." }, { status: 400 });
  }

  const brand = await resolveCustomBrand();

  try {
    await sendEmail({
      to: brand.supportEmail,
      replyTo: email,
      subject: `New contact form message from ${name}`,
      text: [
        `Name: ${name}`,
        `Email: ${email}`,
        company ? `Company: ${company}` : null,
        "",
        message,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch {
    return NextResponse.json({ error: "Message failed to send. Try emailing us directly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

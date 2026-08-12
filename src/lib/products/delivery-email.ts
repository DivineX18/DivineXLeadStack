import "server-only";

/**
 * Render the automated email a buyer receives when a quote/invoice
 * carrying one or more file-delivery products is marked paid. Pure
 * function — mirrors lib/quotes/email.ts's structure/styling for brand
 * consistency across every transactional email this app sends.
 */

export interface DeliveryLink {
  productName: string;
  fileName: string;
  downloadUrl: string;
}

export interface RenderDeliveryEmailInput {
  businessName: string;
  businessLogoUrl?: string | null;
  recipientName: string;
  quoteNumber: string;
  links: DeliveryLink[];
}

export interface RenderedDeliveryEmail {
  subject: string;
  text: string;
  html: string;
}

export function renderProductDeliveryEmail(
  input: RenderDeliveryEmailInput,
): RenderedDeliveryEmail {
  const { businessName, businessLogoUrl, recipientName, quoteNumber, links } = input;
  const safeLogoUrl =
    typeof businessLogoUrl === "string" && /^https?:\/\/.+/i.test(businessLogoUrl)
      ? businessLogoUrl
      : null;
  const safeRecipient = recipientName.trim() || "there";
  const plural = links.length > 1;

  const subject = `Your download${plural ? "s are" : " is"} ready — ${businessName}`;

  const text = [
    `Hi ${safeRecipient},`,
    "",
    `Thanks for your purchase from ${businessName}! Your download${plural ? "s are" : " is"} ready:`,
    "",
    ...links.flatMap((l) => [`${l.productName} (${l.fileName})`, l.downloadUrl, ""]),
    `Order: ${quoteNumber}`,
    "",
    "Each link expires after 30 days. Reply to this email if you need a fresh one after that.",
    "",
    `— ${businessName}`,
  ].join("\n");

  const linkRows = links
    .map(
      (l) => `
              <tr>
                <td style="padding:14px 16px;border-bottom:1px solid #e8e8ec;">
                  <p style="margin:0 0 2px 0;font-size:14px;font-weight:600;color:#0a0a0a;">${escapeHtml(l.productName)}</p>
                  <p style="margin:0 0 10px 0;font-size:12px;color:#6b6b75;">${escapeHtml(l.fileName)}</p>
                  <a href="${escapeHtml(l.downloadUrl)}" style="display:inline-block;background:#5b5bd6;color:#ffffff;text-decoration:none;padding:9px 18px;border-radius:7px;font-size:13px;font-weight:600;">Download →</a>
                </td>
              </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0a0a0a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e8e8ec;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 8px 32px;">
              ${
                safeLogoUrl
                  ? `<img src="${escapeHtml(safeLogoUrl)}" alt="${escapeHtml(businessName)}" style="display:block;max-height:48px;max-width:200px;height:auto;width:auto;margin:0 0 12px 0;border:0;outline:none;text-decoration:none;" />`
                  : ""
              }
              <p style="margin:0 0 4px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;color:#5b5bd6;">
                Order ${escapeHtml(quoteNumber)}
              </p>
              <h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;">
                Your download${plural ? "s are" : " is"} ready
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px 32px;">
              <p style="margin:0 0 4px 0;font-size:15px;line-height:1.6;color:#1a1a22;">
                Hi ${escapeHtml(safeRecipient)}, thanks for your purchase from ${escapeHtml(businessName)}!
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f9;border-radius:8px;overflow:hidden;">
                ${linkRows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px 32px;border-top:1px solid #e8e8ec;">
              <p style="margin:0;font-size:13px;line-height:1.55;color:#6b6b75;">
                Each link expires after 30 days — reply to this email if you need a fresh one after that.<br />
                &mdash; ${escapeHtml(businessName)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

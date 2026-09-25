import "server-only";
import { promises as dns } from "node:dns";

/**
 * WHY A REAL LOOKUP AND NOT A GUESS.
 *
 * The domain card could only say "Failed", which is where a non-technical
 * customer stops and contacts support: it does not distinguish "you haven't
 * added the record yet" from "you added it and pointed it somewhere else"
 * from "you did it right and DNS hasn't propagated". Those need three
 * different actions from the customer, and only one of them is "wait".
 *
 * So this resolves the hostname for real. Every branch is something the
 * lookup actually proved — there is deliberately no inference beyond what DNS
 * returned, because the brief's own rule is not to fabricate certainty the
 * system cannot establish. When we genuinely cannot tell, `unknown` says so.
 */
export type DomainDiagnosis =
  | { kind: "no_record"; detail: string }
  | { kind: "wrong_target"; detail: string; found: string }
  | { kind: "correct_pending"; detail: string }
  | { kind: "resolved"; detail: string }
  | { kind: "unknown"; detail: string };

/** Customer-facing next step for each state. Never mentions Render. */
export function diagnosisAdvice(d: DomainDiagnosis): string {
  switch (d.kind) {
    case "no_record":
      return "Add the DNS record below at the company that manages your domain, then check again.";
    case "wrong_target":
      return "A record exists but points somewhere else. Update it to the target below and check again.";
    case "correct_pending":
      return "Your record looks right. DNS changes can take up to a few hours to spread worldwide. We keep checking automatically.";
    case "resolved":
      return "DNS is resolving. We're finishing the secure certificate, which usually takes a few minutes.";
    case "unknown":
      return "We couldn't read your DNS just now. We'll keep checking automatically.";
  }
}

const norm = (h: string) => h.trim().toLowerCase().replace(/\.$/, "");

export async function diagnoseDomain(
  domain: string,
  expectedTarget: string | null,
): Promise<DomainDiagnosis> {
  const host = norm(domain);
  const want = expectedTarget ? norm(expectedTarget) : null;

  let cnames: string[] = [];
  try {
    cnames = (await dns.resolveCname(host)).map(norm);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // ENODATA/ENOTFOUND on a CNAME query can also mean an A record is present
    // instead, which is a real and different mistake, so check before
    // concluding nothing exists.
    if (code === "ENODATA" || code === "ENOTFOUND") {
      try {
        const a = await dns.resolve4(host);
        if (a.length > 0) {
          return {
            kind: "wrong_target",
            found: `A record → ${a[0]}`,
            detail: "This name has an A record instead of a CNAME.",
          };
        }
      } catch {
        /* no A record either — genuinely nothing published */
      }
      return { kind: "no_record", detail: "No DNS record found for this name yet." };
    }
    return { kind: "unknown", detail: `DNS lookup failed (${code ?? "error"}).` };
  }

  if (cnames.length === 0) {
    return { kind: "no_record", detail: "No CNAME record found for this name yet." };
  }
  if (!want) {
    return { kind: "resolved", detail: `CNAME points to ${cnames[0]}.` };
  }
  if (cnames.some((c) => c === want)) {
    return { kind: "correct_pending", detail: `CNAME correctly points to ${want}.` };
  }
  return {
    kind: "wrong_target",
    found: cnames[0],
    detail: `CNAME points to ${cnames[0]} instead of ${want}.`,
  };
}

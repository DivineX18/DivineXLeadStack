import type { FormField } from "@/types/forms";
import type { ContactAttribution } from "@/types/contacts";
import { trackLeadEvent } from "@/lib/attribution";
import { FUNNEL_SUBMIT_EVENT } from "@/lib/funnels/telemetry-events";

/**
 * The visitor-side submission path, shared by the single-page form and the
 * multi-step one.
 *
 * Extracted rather than duplicated because everything here is load-bearing and
 * easy to forget in a second implementation: consent is opt-in and only blocks
 * when the operator marked it required; the pixel and the conversion beacon
 * must both fire BEFORE any redirect, since the page unloads and takes the
 * scripts with it. A multi-step form that quietly failed to count its own
 * conversions would make the measurement feature lie.
 */

export function validateFormValues(
  fields: FormField[],
  values: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "sms_consent") {
      // Opt-in: "true" means ticked. Only blocks when marked required.
      if (f.required && values[f.id] !== "true") errors[f.id] = "Please tick this box to continue";
      continue;
    }
    if (f.required && !values[f.id]?.trim()) {
      errors[f.id] = `${f.label} is required`;
    } else if (f.type === "email" && values[f.id]) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.id])) errors[f.id] = "Enter a valid email";
    }
  }
  return errors;
}

export interface LeadFormSubmitResult {
  ok: boolean;
  error?: string;
  thankYouMessage?: string;
  redirectUrl?: string | null;
}

export async function submitLeadForm(opts: {
  formId: string;
  values: Record<string, string>;
  attribution: ContactAttribution | null;
}): Promise<LeadFormSubmitResult> {
  let data: LeadFormSubmitResult | null = null;
  try {
    const res = await fetch(`/api/forms/${opts.formId}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: opts.values, attribution: opts.attribution }),
    });
    data = (await res.json()) as LeadFormSubmitResult;
    if (!res.ok || !data.ok) {
      return { ok: false, error: data?.error ?? "Something went wrong. Please try again." };
    }
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }

  // Both of these must happen before any redirect: once the browser
  // navigates, the pixel script unloads with the page and the beacon never
  // fires, so the conversion would go uncounted.
  trackLeadEvent({ utmCampaign: opts.attribution?.utmCampaign ?? null });
  try {
    window.dispatchEvent(new CustomEvent(FUNNEL_SUBMIT_EVENT));
  } catch {
    /* odd host — never block the visitor's confirmation */
  }

  return data;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { FormFieldInput } from "@/components/forms/form-field-input";
import { submitLeadForm, validateFormValues } from "@/lib/forms/submit-client";
import { readAttributionFromBrowser } from "@/lib/attribution";
import type { ContactAttribution } from "@/types/contacts";
import type { MultiStepFormConfig } from "@/types/funnels";
import type { LeadForm } from "@/types/forms";

/**
 * MULTI-STEP CAPTURE.
 *
 * One question at a time converts better than one long form, because each
 * screen asks something small and the visitor can see how much is left. That
 * is the whole feature; everything else is inherited.
 *
 * Inherited, not rebuilt: the fields are the real form's fields, rendered by
 * the same component the single-page form uses, validated by the same rules,
 * and submitted ONCE at the end through the same route. So CRM mapping,
 * automation triggers, attribution, opt-out and conversion counting all work
 * here without this file knowing they exist.
 *
 * Answers survive a refresh (sessionStorage). Someone three steps into a
 * qualification flow who bumps reload should not be punished for it, and a
 * lost half-finished answer is a lost lead.
 */
export function MultiStepFormSection({
  config,
  accentColor,
  forms,
  subAccountId,
  previewMode = false,
}: {
  config: MultiStepFormConfig;
  accentColor: string;
  forms?: Record<string, LeadForm>;
  subAccountId?: string;
  previewMode?: boolean;
}) {
  const form = config.formId && forms ? forms[config.formId] : null;

  // Only steps that still have real fields. Editing the underlying form can
  // orphan a field id; an empty step would be a dead screen with a Next button.
  const steps = (config.steps ?? [])
    .map((s) => ({
      ...s,
      fields: (s.fieldIds ?? []).map((id) => form?.fields.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => !!f),
    }))
    .filter((s) => s.fields.length > 0);

  const storageKey = form ? `dx_ms_${form.id}` : "";
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const attributionRef = useRef<ContactAttribution | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    attributionRef.current = readAttributionFromBrowser();
    if (!storageKey) return;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) setValues(JSON.parse(saved) as Record<string, string>);
    } catch {
      /* storage blocked — the flow still works, it just won't survive a refresh */
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(values));
    } catch {
      /* ignore */
    }
  }, [values, storageKey]);

  if (steps.length === 0 || !form) {
    // No dead submit button: without a real form behind it the section shows
    // its copy and stops there.
    return (
      <div className="mx-auto w-full max-w-xl px-5 text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{config.headline}</h2>
        {config.subheadline && <p className="mt-3 text-base opacity-80">{config.subheadline}</p>}
      </div>
    );
  }

  const step = steps[index];
  const isLast = index === steps.length - 1;
  const progress = ((index + 1) / steps.length) * 100;

  function advance() {
    const stepErrors = validateFormValues(step.fields, values);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setIndex((i) => Math.min(i + 1, steps.length - 1));
    // On a phone the next question can render below the fold; without this the
    // visitor sees an unchanged screen and thinks the button is broken.
    headingRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function back() {
    setErrors({});
    setIndex((i) => Math.max(i - 1, 0));
    headingRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function finish() {
    const stepErrors = validateFormValues(step.fields, values);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;

    if (previewMode) {
      // Preview renders exactly as production but must never create a lead,
      // fire automations or count a conversion.
      setDone("This is a preview, so nothing was submitted.");
      return;
    }

    setApiError(null);
    setSubmitting(true);
    const res = await submitLeadForm({ formId: form!.id, values, attribution: attributionRef.current });
    setSubmitting(false);
    if (!res.ok) {
      setApiError(res.error ?? "Something went wrong. Please try again.");
      return;
    }
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    // Booking is the highest-intent destination a qualification flow has: they
    // have just told you they are a fit, so the next screen should be a time.
    if (config.completion?.mode === "booking" && config.completion.bookingSlug && subAccountId) {
      window.location.href = `/b/${subAccountId}/${config.completion.bookingSlug}`;
      return;
    }
    if (res.redirectUrl) {
      window.location.href = res.redirectUrl;
      return;
    }
    setDone(
      config.completion?.message ||
        res.thankYouMessage ||
        "Thanks, we have everything we need. We'll be in touch shortly.",
    );
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-xl px-5">
        <div className="rounded-2xl border p-8 text-center" style={{ borderColor: `${accentColor}40` }}>
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: accentColor }}
          >
            <Check className="h-6 w-6" />
          </div>
          <p className="text-lg font-semibold tracking-tight">{done}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-5">
      <div ref={headingRef} className="text-center">
        {config.eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-widest opacity-70">{config.eyebrow}</p>
        )}
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{config.headline}</h2>
        {config.subheadline && <p className="mt-3 text-base opacity-80">{config.subheadline}</p>}
      </div>

      <div className="mt-8 rounded-2xl border bg-white/60 p-6 shadow-sm backdrop-blur-sm dark:bg-white/[0.04] sm:p-8">
        {/* Progress. The count is stated in words as well as drawn, because a
            bar alone does not tell someone how much longer this takes. */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-xs font-medium opacity-70">
            <span>
              Step {index + 1} of {steps.length}
            </span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: `${accentColor}22` }}
            role="progressbar"
            aria-valuenow={index + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-label={`Step ${index + 1} of ${steps.length}`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${progress}%`, backgroundColor: accentColor }}
            />
          </div>
        </div>

        <h3 className="text-lg font-semibold tracking-tight">{step.title}</h3>
        {step.subtitle && <p className="mt-1 text-sm opacity-75">{step.subtitle}</p>}

        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (isLast) void finish();
            else advance();
          }}
        >
          {step.fields.map((f) => (
            <FormFieldInput
              key={f.id}
              field={f}
              value={values[f.id] ?? ""}
              error={errors[f.id]}
              onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
            />
          ))}

          {apiError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {apiError}
            </div>
          )}

          {/* Back sits left of the primary on desktop and stacks under it on a
              phone, so the thumb lands on the action, not on Back. `flex-1` is
              desktop-only on purpose: in the stacked column it would make the
              button a flex item with a 0 basis and collapse its height to
              nothing, which is exactly the kind of defect that only shows up
              on a real phone. */}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-[var(--flow-radius,0.75rem)] border px-4 sm:w-auto text-sm font-medium opacity-80 transition-opacity hover:opacity-100"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 w-full shrink-0 items-center justify-center gap-1.5 sm:flex-1 rounded-[var(--flow-radius,0.75rem)] px-5 text-sm font-semibold text-white shadow-sm transition-transform hover:scale-[1.01] disabled:opacity-60 motion-reduce:transition-none"
              style={{ backgroundColor: accentColor }}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Sending
                </>
              ) : isLast ? (
                config.submitLabel || "Submit"
              ) : (
                <>
                  Continue <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormFieldInput } from "@/components/forms/form-field-input";
import { type LeadForm } from "@/types/forms";
import type { ContactAttribution } from "@/types/contacts";
import { readAttributionFromBrowser } from "@/lib/attribution";
import { submitLeadForm, validateFormValues } from "@/lib/forms/submit-client";

interface PublicFormProps {
  form: LeadForm;
  /** Fired once, right when the success state renders (not on redirect —
   *  the page is navigating away at that point anyway). Lets a modal
   *  auto-dismiss a moment after a successful submission. */
  onSuccess?: () => void;
}

export function PublicForm({ form, onSuccess }: PublicFormProps) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of form.fields) initial[f.id] = "";
    return initial;
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState<{
    message: string;
    redirectUrl: string | null;
  } | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const attributionRef = useRef<ContactAttribution | null>(null);

  // Snapshot attribution on mount — before the user navigates, refreshes, or
  // the URL is rewritten by a redirect after submission.
  useEffect(() => {
    attributionRef.current = readAttributionFromBrowser();
  }, []);

  function setValue(id: string, v: string) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    const next = validateFormValues(form.fields, values);
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    // Shared with the multi-step form so attribution, the pixel and the
    // conversion beacon can never drift between the two.
    const data = await submitLeadForm({
      formId: form.id,
      values,
      attribution: attributionRef.current,
    });
    setSubmitting(false);
    if (!data.ok) {
      setApiError(data.error ?? "Something went wrong. Please try again.");
      return;
    }
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
      return;
    }
    setSuccess({
      message: data.thankYouMessage ?? "Thanks, we'll be in touch shortly.",
      redirectUrl: null,
    });
    onSuccess?.();
  }

  if (success) {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">{success.message}</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {form.fields.map((f) => (
        <FormFieldInput
          key={f.id}
          field={f}
          value={values[f.id] ?? ""}
          error={errors[f.id]}
          onChange={(v) => setValue(f.id, v)}
        />
      ))}

      {apiError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {apiError}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit"
        )}
      </Button>
    </form>
  );
}

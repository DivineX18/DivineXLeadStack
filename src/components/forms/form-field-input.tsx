"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { defaultSmsConsentText, type FormField } from "@/types/forms";

/**
 * One form field, rendered the same way everywhere.
 *
 * SIZED FOR A THUMB. These controls appear on public pages, where most
 * visitors arrive from a phone. The dashboard's default 36px input is fine for
 * a mouse and too small for a thumb, and a lead who mis-taps a field just
 * leaves, with no error anywhere to tell you it happened. 44px is Apple's own
 * minimum and the reason these carry an explicit height.
 *
 * Extracted from PublicForm when multi-step arrived: two renderers for the
 * same field types would drift, and the first thing to drift is always the
 * thing a visitor notices — a select that looks different, a consent checkbox
 * that loses its disclosure. The consent field in particular carries CTIA
 * compliance text; there must be exactly one place it is rendered.
 */
export function FormFieldInput({
  field,
  value,
  error,
  onChange,
}: {
  field: FormField;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "sms_consent") {
    return (
      <div className="space-y-1.5">
        <label className="flex cursor-pointer items-start gap-2 text-sm leading-snug text-muted-foreground">
          <input
            type="checkbox"
            checked={value === "true"}
            onChange={(e) => onChange(e.target.checked ? "true" : "")}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer"
            aria-invalid={!!error}
          />
          <span>
            {field.consentText?.trim() || defaultSmsConsentText()}
            {field.required && <span className="text-destructive"> *</span>}
          </span>
        </label>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={field.id}>
        {field.label}
        {field.required && <span className="text-destructive">*</span>}
      </Label>
      {field.type === "textarea" ? (
        <Textarea
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          aria-invalid={!!error}
        />
      ) : field.type === "select" ? (
        <select
          id={field.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 text-foreground dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground"
          aria-invalid={!!error}
        >
          <option value="">Choose one</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : (
        <Input
          id={field.id}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          className="h-11"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          aria-invalid={!!error}
        />
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

import type { FormField } from "@/types/forms";
import type { MultiStepFormStep } from "@/types/funnels";

/**
 * A DIAGNOSTIC ASKED ONE QUESTION AT A TIME.
 *
 * Everything here is composition, not new machinery. The questions become
 * ordinary form fields on an ordinary form, the steps are the existing
 * `multi_step_form` section's steps, and the whole thing submits ONCE at the
 * end through the same route a stacked form uses. CRM mapping, automation
 * triggers, attribution, opt-out and conversion counting therefore work
 * without this file knowing they exist.
 *
 * What it is NOT: no scoring, no branching, no result pages, no page per
 * question, no second submission model. An assessment here is a form whose
 * questions are shown one at a time, and nothing more.
 *
 * NAME AND EMAIL COME FIRST, ON STEP ONE. A visitor who answers eight
 * questions and only then meets a contact form is a visitor who often
 * leaves, and an answer set with nobody attached to it is worth nothing to
 * the operator. Asking first also means the single submission carries both
 * the identity and the answers, so one contact ends up holding all of it.
 */

/** Keep ids stable, readable in the builder, and safe as object keys. */
function questionFieldId(index: number): string {
  return `q${index + 1}`;
}

export interface AssessmentQuestion {
  /** The question as the visitor reads it. */
  question: string;
  /** Preset answers. 2+ turns the step into a pick-one; fewer is free text. */
  options?: string[];
}

/**
 * The form behind a guided assessment: identity first, then one field per
 * question.
 *
 * Answers map to `notes` rather than inventing contact columns: they are
 * durable on the contact and readable on the submission without teaching the
 * CRM a new shape for every diagnostic an operator writes.
 */
export function assessmentFormFields(questions: readonly AssessmentQuestion[]): FormField[] {
  const fields: FormField[] = [
    { id: "name", type: "text", label: "Full name", placeholder: "Jane Doe", required: true, options: [], mapsTo: "name" },
    { id: "email", type: "email", label: "Email", placeholder: "jane@example.com", required: true, options: [], mapsTo: "email" },
  ];
  questions.forEach((q, i) => {
    const options = (q.options ?? []).map((o) => o.trim()).filter(Boolean).slice(0, 8);
    fields.push({
      id: questionFieldId(i),
      // A pick-one is faster to answer and gives the operator comparable
      // answers; free text is the honest fallback when no options were given.
      type: options.length >= 2 ? "select" : "text",
      label: q.question.trim().slice(0, 160),
      placeholder: options.length >= 2 ? "" : "Your answer",
      required: true,
      options,
      mapsTo: null,
    });
  });
  return fields;
}

/**
 * One step per screen: identity, then each question alone.
 *
 * Single-field steps are deliberate. The section renders the step title as
 * the question, so a screen asking one thing reads as one thing.
 */
export function assessmentSteps(questions: readonly AssessmentQuestion[]): MultiStepFormStep[] {
  const steps: MultiStepFormStep[] = [
    { id: "you", title: "First, who should we send this to?", fieldIds: ["name", "email"] },
  ];
  questions.forEach((q, i) => {
    steps.push({ id: questionFieldId(i), title: q.question.trim().slice(0, 160), fieldIds: [questionFieldId(i)] });
  });
  return steps;
}

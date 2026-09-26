import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { contactFormFields, contactFormSettings } from "@/types/forms";
import type { FormField, FormSettings, LeadForm } from "@/types/forms";

/**
 * Admin-SDK form creation — the manual form-builder UI only writes via the
 * client SDK (lib/firestore/forms.ts::createForm), which can't be called
 * from server-only AI Suite code. Mirrors that function's exact doc shape
 * so a Zeno-created form is indistinguishable from an operator-created one.
 */
export async function createFormServerSide(opts: {
  subAccountId: string;
  createdByUid: string;
  name: string;
  fields?: FormField[];
  settings?: Partial<FormSettings>;
}): Promise<string> {
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${opts.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? "";

  const ref = db.collection("forms").doc();
  const doc: Omit<LeadForm, "id"> = {
    name: opts.name.trim() || "Untitled form",
    slug: ref.id,
    fields: opts.fields ?? contactFormFields(),
    settings: { ...contactFormSettings(), ...opts.settings },
    agencyId,
    subAccountId: opts.subAccountId,
    createdByUid: opts.createdByUid,
    enabled: true,
    submissionCount: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set({ id: ref.id, ...doc });
  return ref.id;
}

export async function getForm(subAccountId: string, formId: string): Promise<LeadForm | null> {
  const snap = await getAdminDb().doc(`forms/${formId}`).get();
  if (!snap.exists) return null;
  const f = { id: snap.id, ...(snap.data() as Omit<LeadForm, "id">) };
  return f.subAccountId === subAccountId ? f : null;
}

/** This workspace's forms, with the ids an edit needs. */
export async function listFormsServerSide(
  subAccountId: string,
): Promise<{ id: string; name: string; enabled: boolean; submissionCount: number; fields: FormField[] }[]> {
  const snap = await getAdminDb()
    .collection("forms")
    .where("subAccountId", "==", subAccountId)
    .limit(50)
    .get();
  return snap.docs.map((d) => {
    const x = d.data() as Omit<LeadForm, "id">;
    return {
      id: d.id,
      name: String(x.name ?? "Untitled form"),
      enabled: x.enabled !== false,
      submissionCount: Number(x.submissionCount ?? 0),
      fields: (x.fields ?? []) as FormField[],
    };
  });
}

export type FormPatchResult =
  | { ok: true; formId: string; name: string; summary: string }
  | { ok: false; reason: "missing" | "no_field" | "last_email" | "consent" | "duplicate" | "invalid"; error?: string };

/**
 * FIELD-LEVEL EDITS, not a replacement document.
 *
 * A form is an ordered list, which is exactly the shape where a generated
 * payload is dangerous: asked to add one question, a model that returns "the
 * fields" returns the one it was thinking about and the other five are gone,
 * along with every mapping that made submissions become contacts. So the
 * operations here are add / update / remove ONE field, plus a rename. The
 * stored list is always the base.
 *
 * Two refusals that are not arbitrary:
 *
 *   - The last field mapping to `email` cannot be removed. That mapping is
 *     how a submission becomes a contact with a reachable address; without
 *     it the form still collects, and every lead it captures is unreachable.
 *   - An `sms_consent` field's disclosure text is not editable. It is the
 *     stored proof of consent and must carry the CTIA-required elements;
 *     rewording it is a compliance act, not copywriting.
 */
export async function patchFormServerSide(opts: {
  subAccountId: string;
  formId: string;
  rename?: string;
  addField?: { type: FormField["type"]; label: string; required?: boolean; placeholder?: string; options?: string[]; mapsTo?: FormField["mapsTo"] };
  updateField?: { fieldId: string; label?: string; required?: boolean; placeholder?: string; options?: string[] };
  removeFieldId?: string;
}): Promise<FormPatchResult> {
  const db = getAdminDb();
  const ref = db.doc(`forms/${opts.formId}`);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, reason: "missing" };
  const form = snap.data() as Omit<LeadForm, "id">;
  // A form id from another workspace behaves exactly like a missing one.
  if (form.subAccountId !== opts.subAccountId) return { ok: false, reason: "missing" };

  const fields: FormField[] = [...((form.fields ?? []) as FormField[])];
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  let summary = "";

  if (opts.rename?.trim()) {
    updates.name = opts.rename.trim().slice(0, 120);
    summary = `renamed it to "${updates.name as string}"`;
  }

  if (opts.addField) {
    const label = opts.addField.label.trim();
    if (fields.some((f) => f.label.trim().toLowerCase() === label.toLowerCase())) {
      return { ok: false, reason: "duplicate" };
    }
    const field: FormField = {
      id: `f_${Math.random().toString(36).slice(2, 10)}`,
      type: opts.addField.type,
      label,
      placeholder: opts.addField.placeholder?.trim() ?? "",
      required: opts.addField.required === true,
      options: opts.addField.options ?? [],
      mapsTo: opts.addField.mapsTo ?? null,
    };
    fields.push(field);
    updates.fields = fields;
    summary = `added the "${label}" question`;
  }

  if (opts.updateField) {
    const idx = fields.findIndex((f) => f.id === opts.updateField!.fieldId);
    if (idx === -1) return { ok: false, reason: "no_field" };
    const target = fields[idx];
    if (target.type === "sms_consent") return { ok: false, reason: "consent" };
    fields[idx] = {
      ...target,
      ...(opts.updateField.label !== undefined ? { label: opts.updateField.label.trim() } : {}),
      ...(opts.updateField.placeholder !== undefined ? { placeholder: opts.updateField.placeholder.trim() } : {}),
      ...(opts.updateField.required !== undefined ? { required: opts.updateField.required } : {}),
      ...(opts.updateField.options !== undefined ? { options: opts.updateField.options } : {}),
    };
    updates.fields = fields;
    summary = `updated the "${fields[idx].label}" question`;
  }

  if (opts.removeFieldId) {
    const target = fields.find((f) => f.id === opts.removeFieldId);
    if (!target) return { ok: false, reason: "no_field" };
    if (target.mapsTo === "email" && fields.filter((f) => f.mapsTo === "email").length === 1) {
      return { ok: false, reason: "last_email" };
    }
    const remaining = fields.filter((f) => f.id !== opts.removeFieldId);
    if (remaining.length === 0) return { ok: false, reason: "invalid", error: "A form needs at least one question." };
    updates.fields = remaining;
    summary = `removed the "${target.label}" question`;
  }

  if (Object.keys(updates).length === 1) return { ok: false, reason: "invalid", error: "Nothing to change." };

  await ref.set(updates, { merge: true });
  return {
    ok: true,
    formId: opts.formId,
    name: String(updates.name ?? form.name ?? "Untitled form"),
    summary,
  };
}

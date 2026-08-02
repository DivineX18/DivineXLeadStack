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

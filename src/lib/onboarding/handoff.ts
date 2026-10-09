import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { createSubAccountForAgency } from "@/lib/server/sub-accounts-service";
import { createTaskServerSide } from "@/lib/server/tasks-service";
import { listOnboardingAssets } from "@/lib/onboarding/assets";
import {
  getOnboarding,
  listAccess,
  recordOnboardingEvent,
  setOnboardingStatus,
} from "@/lib/server/client-onboarding-service";
import type { ClientOnboardingDoc } from "@/types/client-onboarding";

/**
 * PRODUCTION HANDOFF — the moment an engagement becomes an operational client.
 *
 * THIS is where the workspace is created, not at enrollment. A prospect who
 * pays and then goes quiet leaves a CRM contact and a stalled onboarding
 * record, which is exactly what they are. They do not leave an empty Flow
 * workspace carrying its own billing state, Firestore rules, sidebar entry and
 * seat against the agency's plan ceiling.
 *
 * Nothing here deploys, publishes or activates anything. It creates the
 * workspace, writes the brief, and opens the tasks a human then works through.
 */

export interface HandoffResult {
  ok: boolean;
  subAccountId?: string;
  tasksCreated?: number;
  error?: string;
  /** Requirements still outstanding, when readiness was refused. */
  outstanding?: string[];
}

/** What still stands between this engagement and production. */
export function outstandingRequirements(
  onboarding: ClientOnboardingDoc,
  assetKeys: string[],
  access: { key: string; state: string; required: boolean }[],
): string[] {
  const out: string[] = [];
  const sections = onboarding.package.intakeSections ?? [];
  const done = new Set(onboarding.intakeSectionsComplete ?? []);
  for (const s of sections) if (!done.has(s)) out.push(`Intake section: ${s}`);
  for (const a of onboarding.package.requiredAssets ?? []) {
    if (!assetKeys.includes(a)) out.push(`Asset: ${a}`);
  }
  for (const p of access) {
    // Only VERIFIED counts. "The client says they sent it" is not access.
    if (p.required && p.state !== "verified") out.push(`Access not verified: ${p.key}`);
  }
  return out;
}

/** The brief a human picks up. Plain markdown, from real answers only. */
export function buildProjectBrief(
  onboarding: ClientOnboardingDoc,
  assets: { key: string; filename: string }[],
  access: { key: string; state: string; permissionLevel: string }[],
): string {
  const lines: string[] = [];
  lines.push(`# Project brief: ${onboarding.businessName}`);
  lines.push("");
  lines.push(`**Package:** ${onboarding.package.name}`);
  lines.push(`**Contact:** ${onboarding.contactEmail}`);
  if (onboarding.websiteUrl) lines.push(`**Website:** ${onboarding.websiteUrl}`);
  if (onboarding.notes) lines.push(`**Notes at enrollment:** ${onboarding.notes}`);
  lines.push("");

  for (const section of onboarding.package.intakeSections ?? []) {
    const answers = onboarding.intake?.[section];
    if (!answers || Object.keys(answers).length === 0) continue;
    lines.push(`## ${section}`);
    for (const [k, v] of Object.entries(answers)) {
      const value = Array.isArray(v) ? v.join(", ") : String(v ?? "");
      if (!value.trim()) continue;
      lines.push(`- **${k}**: ${value}`);
    }
    lines.push("");
  }

  if (assets.length) {
    lines.push("## Assets supplied");
    for (const a of assets) lines.push(`- ${a.key}: ${a.filename}`);
    lines.push("");
  }
  lines.push("## Platform access");
  for (const p of access) lines.push(`- ${p.key} (${p.permissionLevel}): ${p.state}`);
  lines.push("");
  lines.push("_Generated at production handoff. Every line above came from the client._");
  return lines.join("\n");
}

/**
 * Promote an onboarding to an operational client.
 *
 * Idempotent on the workspace: if `subAccountId` is already set, the workspace
 * is reused rather than a second one created. A double-click must not give a
 * client two workspaces.
 */
export async function handoffToProduction(opts: {
  agencyId: string;
  onboardingId: string;
  actorUid: string;
  actorEmail: string;
  actorDisplayName: string;
  /** Skip the readiness gate. Staff-only, and recorded. */
  force?: boolean;
}): Promise<HandoffResult> {
  const onboarding = await getOnboarding(opts.agencyId, opts.onboardingId);
  if (!onboarding) return { ok: false, error: "That onboarding no longer exists." };
  if (onboarding.status === "cancelled") return { ok: false, error: "This onboarding was cancelled." };

  const [assets, access] = await Promise.all([
    listOnboardingAssets(onboarding.id),
    listAccess(onboarding.id),
  ]);
  const assetKeys = [...new Set(assets.map((a) => a.key))];
  const outstanding = outstandingRequirements(onboarding, assetKeys, access);
  if (outstanding.length > 0 && !opts.force) {
    return { ok: false, error: "Not everything is in yet.", outstanding };
  }

  let subAccountId = onboarding.subAccountId;
  if (!subAccountId) {
    const created = await createSubAccountForAgency({
      agencyId: opts.agencyId,
      uid: opts.actorUid,
      email: opts.actorEmail,
      displayName: opts.actorDisplayName,
      name: onboarding.businessName,
      slug: "",
      timezone: "UTC",
      accountContact: {
        name: onboarding.businessName,
        email: onboarding.contactEmail,
        phone: null,
      },
    } as never);
    subAccountId = (created as { subAccountId: string }).subAccountId;
  }

  const brief = buildProjectBrief(
    onboarding,
    assets.map((a) => ({ key: a.key, filename: a.filename })),
    access.map((p) => ({ key: p.key, state: p.state, permissionLevel: p.permissionLevel })),
  );

  // The checklist comes from the SNAPSHOT, so the tasks match what this client
  // was actually sold rather than whatever the package says today.
  const checklist = onboarding.package.productionChecklist ?? [];
  let tasksCreated = 0;
  for (const title of checklist.slice(0, 40)) {
    try {
      await createTaskServerSide({
        subAccountId,
        agencyId: opts.agencyId,
        createdByUid: opts.actorUid,
        title: title.slice(0, 200),
        notes: `From onboarding ${onboarding.id} (${onboarding.package.name}).`,
        dueAt: null,
        contactId: null,
      } as never);
      tasksCreated++;
    } catch (err) {
      // One failed task must not strand a handoff that already created a
      // workspace. The count comes back so the caller can say what landed.
      console.error("[onboarding] handoff task failed", err);
    }
  }

  await getAdminDb().doc(`clientOnboardings/${onboarding.id}`).update({
    subAccountId,
    projectBrief: brief,
    status: "ready_for_production",
    readyForProductionAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await recordOnboardingEvent({
    onboardingId: onboarding.id,
    agencyId: opts.agencyId,
    type: "onboarding.ready_for_production",
    actor: opts.actorUid,
    detail:
      `Workspace ${subAccountId} ${onboarding.subAccountId ? "reused" : "created"}, ` +
      `${tasksCreated} task(s) opened${opts.force && outstanding.length ? `, forced past ${outstanding.length} outstanding item(s)` : ""}.`,
  });

  return { ok: true, subAccountId, tasksCreated };
}

export { setOnboardingStatus };

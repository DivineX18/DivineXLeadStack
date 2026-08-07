import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { BusinessHealthSummary, WithMeta } from "@/types/intelligence";

/**
 * Ascend OS Phase 2, Slice 9 — Flow-side operational data for the Home
 * Dashboard (revenue/pipeline/leads/tasks/appointments). No equivalent
 * reusable SERVER-side function existed before this slice — the existing
 * `sa/[subAccountId]/dashboard` page computes its own KPIs client-side via
 * Firestore `onSnapshot` listeners, which a Server Component composer
 * cannot reuse directly. This is new, necessary composition code built
 * against the same field names that client path already relies on
 * (`deals.stageId`/`value`, `tasks.dueAt`/`completed`, `events.startAt`,
 * `contacts.createdAt` — confirmed this effort via direct reads of
 * `lib/import/bulk-write.ts`'s field-level writers and
 * `types/deals.ts`'s `PIPELINE_STAGES`), not a duplicate of anything that
 * already exists in reusable form.
 *
 * Deliberately never throws — a Firestore read failure here must never
 * block the rest of the Home Dashboard from rendering (Business Memory,
 * intelligence, etc. are independent). Fails closed to "unavailable".
 */
export async function composeBusinessHealthSummary(workspaceId: string): Promise<WithMeta<BusinessHealthSummary>> {
  try {
    const db = getAdminDb();
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const [dealsSnap, contactsSnap, tasksSnap, eventsSnap] = await Promise.all([
      db.collection("deals").where("subAccountId", "==", workspaceId).get(),
      db
        .collection("contacts")
        .where("subAccountId", "==", workspaceId)
        .where("createdAt", ">=", startOfWeek)
        .get()
        .catch(() => null), // composite index may not exist yet — degrade to 0 rather than fail the whole summary
      db.collection("tasks").where("subAccountId", "==", workspaceId).where("completed", "==", false).get(),
      db
        .collection("events")
        .where("subAccountId", "==", workspaceId)
        .where("startAt", ">=", now)
        .get()
        .catch(() => null),
    ]);

    let revenueThisMonthCents = 0;
    let wonDealsThisMonth = 0;
    let openPipelineValueCents = 0;
    let openPipelineCount = 0;
    for (const doc of dealsSnap.docs) {
      const d = doc.data() as { stageId?: string; value?: number; stageChangedAt?: { toDate?: () => Date } };
      const value = typeof d.value === "number" ? d.value : 0;
      if (d.stageId === "won") {
        const changedAt = d.stageChangedAt?.toDate?.() ?? null;
        if (changedAt && changedAt >= startOfMonth) {
          revenueThisMonthCents += value;
          wonDealsThisMonth += 1;
        }
      } else if (d.stageId !== "lost") {
        openPipelineValueCents += value;
        openPipelineCount += 1;
      }
    }

    let overdueTaskCount = 0;
    let dueTodayTaskCount = 0;
    for (const doc of tasksSnap.docs) {
      const t = doc.data() as { dueAt?: { toDate?: () => Date } };
      const dueAt = t.dueAt?.toDate?.() ?? null;
      if (!dueAt) continue;
      if (dueAt < now) overdueTaskCount += 1;
      else if (dueAt < startOfTomorrow) dueTodayTaskCount += 1;
    }

    const summary: BusinessHealthSummary = {
      revenueThisMonthCents,
      wonDealsThisMonth,
      openPipelineValueCents,
      openPipelineCount,
      newLeadsThisWeek: contactsSnap?.size ?? 0,
      overdueTaskCount,
      dueTodayTaskCount,
      upcomingAppointmentCount: eventsSnap?.size ?? 0,
    };

    return { meta: { status: "ok", fetchedAt: Date.now(), reasonCode: null }, data: summary };
  } catch (err) {
    console.error(`[compose-business-health] failed workspaceId=${workspaceId}`, err);
    return { meta: { status: "unavailable", fetchedAt: null, reasonCode: "firestore_read_failed" }, data: null };
  }
}

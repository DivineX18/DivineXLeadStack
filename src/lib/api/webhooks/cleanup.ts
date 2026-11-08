import "server-only";
import type { Firestore } from "firebase-admin/firestore";

type Run = <T>(operation: string, work: () => Promise<T>) => Promise<T>;
const direct: Run = (_operation, work) => work();
function expiry(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  )
    return value.toDate().getTime();
  return NaN;
}

/** Supports the implemented event -> leaf deliveries model only. Unexpected
 * descendants are held, never orphaned or recursively erased. The parent is a
 * durable cleanup fence, also checked by every delivery writer. */
export async function sweepBoundedWebhookEvents(
  db: Firestore,
  now: Date,
  run: Run = direct
) {
  const limit = 500;
  let deleted = 0,
    deliveriesDeleted = 0,
    parentsDeleted = 0,
    held = 0;
  const parents = await run("query_expired", () =>
    db
      .collectionGroup("webhookEvents")
      .where("expiresAt", "<", now)
      .limit(limit)
      .get()
  );
  const result = () => ({
    collection: "webhookEvents",
    deleted,
    parentsDeleted,
    deliveriesDeleted,
    held,
    hitCap: deleted >= limit || (parents.size >= limit && deleted > 0),
  });
  if (parents.empty) return result();
  for (const candidate of parents.docs) {
    if (deleted >= limit) break;
    const parent = candidate.ref,
      deliveries = parent.collection("deliveries");
    const collections = await run("inspect_schema", () =>
      parent.listCollections()
    );
    if (collections.some((c) => c.id !== "deliveries")) {
      held++;
      continue;
    }
    const claimed = await run("claim_expired_parent", () =>
      db.runTransaction(async (tx) => {
        const event = await tx.get(parent);
        if (!event.exists) return false;
        const data = event.data()!;
        if (!(expiry(data.expiresAt) < now.getTime())) return false;
        if (data.cleanupState === "deleting") return true;
        if (data.cleanupState) return false;
        const pending = await tx.get(
          deliveries.where("status", "==", "pending").limit(1)
        );
        const retrying = await tx.get(
          deliveries.where("nextRetryAt", ">", now).limit(1)
        );
        if (!pending.empty || !retrying.empty) return false;
        tx.update(parent, { cleanupState: "deleting" });
        return true;
      })
    );
    if (!claimed) {
      held++;
      continue;
    }

    // Every successful iteration consumes the deletion budget. A race or hold
    // exits rather than spinning. 499 leaves room for the parent fence write.
    while (deleted < limit) {
      const leaves = await run("query_deliveries", () =>
        deliveries.limit(Math.min(499, limit - deleted)).get()
      );
      if (leaves.empty) {
        // A surviving collection also covers missing intermediate documents
        // with deeper descendants. Do not enumerate or recursively erase them.
        const childCollections = await run("inspect_schema", () =>
          parent.listCollections()
        );
        if (childCollections.length) {
          held++;
          break;
        }
        const removed = await run("delete_empty_parent", () =>
          db.runTransaction(async (tx) => {
            const event = await tx.get(parent);
            const children = await tx.get(deliveries.limit(1));
            if (
              !event.exists ||
              event.data()?.cleanupState !== "deleting" ||
              !(expiry(event.data()?.expiresAt) < now.getTime()) ||
              !children.empty
            )
              return false;
            tx.delete(parent);
            return true;
          })
        );
        if (removed) {
          deleted++;
          parentsDeleted++;
        }
        break;
      }
      let unsupported = false;
      for (const leaf of leaves.docs) {
        const children = await run("inspect_schema", () =>
          leaf.ref.listCollections()
        );
        if (
          children.length ||
          !["succeeded", "failed", "exhausted"].includes(leaf.data().status) ||
          expiry(leaf.data().nextRetryAt) > now.getTime()
        ) {
          unsupported = true;
          break;
        }
      }
      if (unsupported) {
        held++;
        break;
      }
      const count = await run("delete_delivery_batch", () =>
        db.runTransaction(async (tx) => {
          const event = await tx.get(parent);
          const current = await tx.getAll(...leaves.docs.map((d) => d.ref));
          if (
            !event.exists ||
            event.data()?.cleanupState !== "deleting" ||
            !(expiry(event.data()?.expiresAt) < now.getTime())
          )
            return 0;
          const present = current.filter((d) => d.exists);
          if (
            present.some(
              (d) =>
                !["succeeded", "failed", "exhausted"].includes(
                  d.data()!.status
                ) || expiry(d.data()!.nextRetryAt) > now.getTime()
            )
          )
            return 0;
          for (const doc of present) tx.delete(doc.ref);
          // Serialize with concurrent cleanup chunks and guarded delivery writers.
          tx.update(parent, { cleanupState: "deleting" });
          return present.length;
        })
      );
      if (!count) {
        held++;
        break;
      }
      deleted += count;
      deliveriesDeleted += count;
    }
  }
  return result();
}

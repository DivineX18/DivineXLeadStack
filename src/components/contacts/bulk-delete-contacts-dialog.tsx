"use client";

import { useState } from "react";
import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useSubAccount } from "@/context/sub-account-context";

/** Matches MAX_PER_REQUEST in the bulk-delete route. Larger selections are
 *  chunked, so a 400-row delete is four requests and a failure part-way keeps
 *  the chunks that already succeeded. */
const CHUNK = 100;

interface Blocker {
  type: string;
  label: string;
  count: number;
}
interface Outcome {
  contactId: string;
  status: "deleted" | "blocked" | "not_found" | "wrong_workspace";
  blockers?: Blocker[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ids to delete, in selection order. */
  contactIds: string[];
  /** Cleared on a run that deleted anything, so the table drops stale rows. */
  onDeleted: (deletedIds: string[]) => void;
}

export function BulkDeleteContactsDialog({ open, onOpenChange, contactIds, onDeleted }: Props) {
  const { subAccount } = useSubAccount();
  const [working, setWorking] = useState(false);
  const [blocked, setBlocked] = useState<Outcome[] | null>(null);

  const count = contactIds.length;

  async function run() {
    if (!subAccount?.id || count === 0) return;
    setWorking(true);
    setBlocked(null);

    const deletedIds: string[] = [];
    const blockedOut: Outcome[] = [];
    let failedChunk = false;

    try {
      for (let i = 0; i < contactIds.length; i += CHUNK) {
        const chunk = contactIds.slice(i, i + CHUNK);
        const res = await fetch("/api/contacts/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subAccountId: subAccount.id, contactIds: chunk }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          results?: Outcome[];
          error?: string;
        };
        if (!res.ok) {
          failedChunk = true;
          toast.error(data.error ?? "Couldn't delete those contacts.");
          break;
        }
        for (const r of data.results ?? []) {
          if (r.status === "deleted") deletedIds.push(r.contactId);
          else blockedOut.push(r);
        }
      }
    } catch {
      failedChunk = true;
      toast.error("Couldn't reach the server. Nothing further was deleted.");
    } finally {
      setWorking(false);
    }

    if (deletedIds.length > 0) onDeleted(deletedIds);

    // Report what actually happened rather than a flat success. A run that
    // deleted 12 of 40 and silently closed would read as "done".
    if (deletedIds.length > 0 && blockedOut.length === 0 && !failedChunk) {
      toast.success(`Deleted ${deletedIds.length} contact${deletedIds.length === 1 ? "" : "s"}.`);
      onOpenChange(false);
      return;
    }
    if (deletedIds.length > 0) {
      toast.success(`Deleted ${deletedIds.length}. ${blockedOut.length} kept — see why below.`);
    } else if (blockedOut.length > 0) {
      toast.error("Nothing was deleted. Every selected contact is still linked to other records.");
    }
    setBlocked(blockedOut.length > 0 ? blockedOut : null);
    if (blockedOut.length === 0 && !failedChunk) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (working ? null : onOpenChange(v))}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-destructive" />
            Delete {count} contact{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            This permanently removes {count === 1 ? "this contact" : "these contacts"} and their
            notes, activities and message history. It cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {!blocked && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
            Contacts still linked to a deal, task, booking, quote, form submission, web-chat
            conversation or voice call will be <strong>kept, not deleted</strong>. Deleting them
            would leave those records pointing at nothing, so they are skipped and listed back to
            you.
          </div>
        )}

        {blocked && (
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3 text-sm">
            <p className="font-medium">
              {blocked.length} contact{blocked.length === 1 ? " was" : "s were"} kept:
            </p>
            <ul className="space-y-1 text-muted-foreground">
              {blocked.slice(0, 25).map((b) => (
                <li key={b.contactId}>
                  {b.status === "blocked" && b.blockers?.length
                    ? `Linked to ${b.blockers.map((x) => `${x.count} ${x.label}${x.count === 1 ? "" : "s"}`).join(", ")}`
                    : b.status === "not_found"
                      ? "Already deleted"
                      : "Not in this workspace"}
                </li>
              ))}
              {blocked.length > 25 && <li>…and {blocked.length - 25} more.</li>}
            </ul>
            <p className="pt-1 text-xs">
              Remove or reassign those records first, then delete the contact.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>
            {blocked ? "Close" : "Cancel"}
          </Button>
          {!blocked && (
            <Button variant="destructive" onClick={run} disabled={working || count === 0}>
              {working ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting…
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete {count}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

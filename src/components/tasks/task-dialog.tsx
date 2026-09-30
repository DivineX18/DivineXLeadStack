"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { describeError } from "@/lib/errors/describe";
import { Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/quotes/contact-picker";
import { useSubAccount } from "@/context/sub-account-context";
import { updateTask, deleteTask } from "@/lib/firestore/tasks";
import { toDate } from "@/lib/format";
import type { Task, TaskFormData } from "@/types/tasks";
import { useAssignableMembers } from "@/hooks/use-assignable-members";
import { useAuth } from "@/hooks/use-auth";
import type { Contact } from "@/types/contacts";

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
  task?: Task | null;
  defaultContactId?: string | null;
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function TaskDialog({
  open,
  onOpenChange,
  contacts,
  task,
  defaultContactId,
}: TaskDialogProps) {
  const { subAccountId } = useSubAccount();
  const { user } = useAuth();
  const { members } = useAssignableMembers(subAccountId);
  const isEdit = !!task;

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  // "" is Unassigned. A uid must be one of the workspace's active members;
  // the Firestore rule rejects anything else, whatever the form submits.
  const [assigneeUserId, setAssigneeUserId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    if (task) {
      const d = toDate(task.dueAt);
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setDueDate(d ? toDateInput(d) : "");
      setDueTime(d ? toTimeInput(d) : "");
      setContactId(task.contactId);
      setAssigneeUserId(task.assigneeUserId ?? "");
    } else {
      setTitle("");
      setNotes("");
      setDueDate("");
      setDueTime("");
      setContactId(defaultContactId ?? null);
      setAssigneeUserId("");
    }
    setErrors({});
  }, [open, task, defaultContactId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Title is required";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    let dueAt: Date | null = null;
    if (dueDate) {
      const time = dueTime || "23:59";
      dueAt = new Date(`${dueDate}T${time}:00`);
    }

    const payload: TaskFormData = {
      title: title.trim(),
      notes: notes.trim(),
      dueAt,
      contactId,
      dealId: task?.dealId ?? null,
      eventId: task?.eventId ?? null,
      // null clears it; a uid sets it. Never undefined here, so an edit
      // that removes the assignee actually removes it.
      assigneeUserId: assigneeUserId || null,
    };

    setSaving(true);
    try {
      if (isEdit && task) {
        // Plain edit has no webhook event — stays a client-side write.
        await updateTask(task.id, payload);
        toast.success("Task updated");
      } else {
        // Create goes through the server so task.created fires.
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subAccountId,
            title: payload.title,
            notes: payload.notes,
            dueAt: payload.dueAt ? payload.dueAt.toISOString() : null,
            contactId: payload.contactId,
            dealId: payload.dealId,
            eventId: payload.eventId,
          }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(b.error ?? "Couldn't save task. Try again.");
          return;
        }
        toast.success("Task created");
      }
      onOpenChange(false);
    } catch (err) { console.error(err);
      toast.error(describeError(err, "Couldn't save task. Try again."), { duration: 12_000 });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirm(`Delete task "${task.title}"?`)) return;
    setDeleting(true);
    try {
      await deleteTask(task.id);
      toast.success("Task deleted");
      onOpenChange(false);
    } catch (err) { console.error(err);
      toast.error(describeError(err, "Couldn't delete task."), { duration: 12_000 });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Task" : "New Task"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update this task."
              : "A follow-up, a reminder, or anything you don't want to forget."}
          </SheetDescription>
        </SheetHeader>

        <form className="space-y-4 p-4 pt-0" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="task-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Follow up with Sarah"
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="task-date">Due date</Label>
              <Input
                id="task-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-time">Time</Label>
              <Input
                id="task-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                disabled={!dueDate}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-assignee">Assignee</Label>
            <select
              id="task-assignee"
              value={assigneeUserId}
              onChange={(e) => setAssigneeUserId(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Unassigned</option>
              {/* Built from ACTUAL active members of this workspace, never
                  from the plan's seat capacity. A solo workspace shows one
                  person, which is correct rather than a missing feature. */}
              {members.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.uid === user?.uid ? `${m.name} (me)` : m.name}
                </option>
              ))}
              {/* A former member who still holds the task stays selectable
                  so an edit does not silently reassign it. */}
              {assigneeUserId && !members.some((m) => m.uid === assigneeUserId) && (
                <option value={assigneeUserId}>Former member</option>
              )}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-contact">Linked contact</Label>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ContactPicker
                  id="task-contact"
                  contacts={contacts}
                  value={contactId ?? ""}
                  onChange={(id) => setContactId(id)}
                  placeholder="Optional, link to a contact"
                  title="Link a contact"
                />
              </div>
              {contactId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setContactId(null)}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Notes</Label>
            <Textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any context, agenda, or prep."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {isEdit ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={saving || deleting}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Task"}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

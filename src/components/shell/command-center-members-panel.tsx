"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CommandCenterMemberRow, CommandCenterInviteRow } from "@/lib/server/command-center-service";

/**
 * Reuses the EXISTING member management routes
 * (/api/sub-accounts/[id]/invite, /api/sub-accounts/[id]/members/[uid]) —
 * this component only adds the missing piece per the reuse audit: a
 * server-side list read, since neither route/service previously exposed
 * one (the existing Settings UI reads members via a live client listener
 * instead).
 */
export function CommandCenterMembersPanel({ subAccountId }: { subAccountId: string }) {
  const [members, setMembers] = useState<CommandCenterMemberRow[] | null>(null);
  const [invites, setInvites] = useState<CommandCenterInviteRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "collaborator">("collaborator");
  const [inviting, setInviting] = useState(false);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const refetch = useCallback(() => {
    fetch(`/api/command-center/workspaces/${subAccountId}/members`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load members"))))
      .then((d: { members: CommandCenterMemberRow[]; invites: CommandCenterInviteRow[] }) => {
        setMembers(d.members);
        setInvites(d.invites);
      })
      .catch((e: Error) => setError(e.message));
  }, [subAccountId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "Failed to invite");
      toast.success(body.added ? "Added to workspace." : "Invite sent.");
      setInviteEmail("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(uid: string, role: "admin" | "collaborator") {
    setBusyUid(uid);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/members/${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed to update role");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role.");
    } finally {
      setBusyUid(null);
    }
  }

  async function handleRevoke(uid: string) {
    setBusyUid(uid);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/members/${uid}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed to remove member");
      toast.success("Member removed.");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member.");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Invite by email</label>
          <Input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <select
          value={inviteRole}
          onChange={(e) => setInviteRole(e.target.value as "admin" | "collaborator")}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          <option value="collaborator">Collaborator</option>
          <option value="admin">Admin</option>
        </select>
        <Button size="sm" onClick={handleInvite} disabled={inviting}>
          {inviting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserPlus className="mr-1.5 h-4 w-4" />}
          Invite
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {!members && !error && (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
        </div>
      )}

      {members && (
        <ul className="divide-y">
          {members.map((m) => (
            <li key={m.uid} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div>
                <p className="font-medium">{m.displayName || m.email || m.uid}</p>
                {m.email && m.displayName && <p className="text-xs text-muted-foreground">{m.email}</p>}
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  disabled={busyUid === m.uid}
                  onChange={(e) => handleRoleChange(m.uid, e.target.value as "admin" | "collaborator")}
                  className="h-8 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="collaborator">Collaborator</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={() => handleRevoke(m.uid)}
                  disabled={busyUid === m.uid}
                  title="Remove from workspace"
                  className="rounded-md border p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
          {members.length === 0 && <li className="py-4 text-sm text-muted-foreground">No members.</li>}
        </ul>
      )}

      {invites.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Pending invites</p>
          <ul className="space-y-1">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between text-sm">
                <span>{i.email}</span>
                <Badge variant="outline">{i.role}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

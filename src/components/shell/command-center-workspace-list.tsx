"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, ExternalLink, Settings2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CommandCenterManageTrigger } from "@/components/shell/command-center-manage-trigger";
import type { CommandCenterWorkspaceSummary } from "@/lib/server/command-center-service";

type TierFilter = "all" | "full_ascend" | "crm_only";

async function authedJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

export function CommandCenterWorkspaceList() {
  const [workspaces, setWorkspaces] = useState<CommandCenterWorkspaceSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const refetch = useCallback(() => {
    authedJson<{ workspaces: CommandCenterWorkspaceSummary[] }>("/api/command-center/workspaces")
      .then((d) => setWorkspaces(d.workspaces))
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const filtered = useMemo(() => {
    if (!workspaces) return [];
    const q = query.trim().toLowerCase();
    return workspaces.filter((w) => {
      if (tierFilter !== "all" && w.effectiveTier !== tierFilter) return false;
      if (!q) return true;
      return w.name.toLowerCase().includes(q) || String(w.accountNumber ?? "").includes(q);
    });
  }, [workspaces, query, tierFilter]);

  return (
    <div className="rounded-2xl border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] p-6 text-[var(--dx-text-primary)]">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workspaces…" className="pl-9" />
        </div>
        <div className="flex gap-1 rounded-md border p-1 text-sm">
          {(["all", "full_ascend", "crm_only"] as TierFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTierFilter(t)}
              className={`rounded px-2.5 py-1 transition-colors ${tierFilter === t ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
            >
              {t === "all" ? "All" : t === "full_ascend" ? "Full Ascend" : "CRM-only"}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create workspace
        </Button>
      </div>

      {loadError && <p className="text-sm text-destructive">{loadError}</p>}
      {!workspaces && !loadError && (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading workspaces…
        </div>
      )}
      {workspaces && filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No workspaces match.</p>}

      {workspaces && filtered.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Workspace</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Tier</th>
                <th className="py-2 pr-3 font-medium">Ascend gate</th>
                <th className="py-2 pr-3 font-medium">Billing</th>
                <th className="py-2 pr-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.subAccountId} className="border-b last:border-0">
                  <td className="py-2.5 pr-3">
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">#{w.accountNumber ?? "—"}</div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={w.status === "active" ? "secondary" : "outline"}>{w.status}</Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={w.effectiveTier === "full_ascend" ? "default" : "outline"}>
                      {w.effectiveTier === "full_ascend" ? "Full Ascend" : "CRM-only"}
                    </Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    {w.ascendIntelligenceEnabledByAgency ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <ShieldCheck className="h-3.5 w-3.5" /> On
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Off</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-muted-foreground">{w.billingState}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <a
                        href={`/sa/${w.subAccountId}/switch?next=${encodeURIComponent("/app/home")}`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        title="Open this workspace"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                      <a
                        href={`/command-center/${w.subAccountId}`}
                        className="rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        title="Provisioning + audit"
                      >
                        Audit
                      </a>
                      <CommandCenterManageTrigger subAccountId={w.subAccountId} onAfterClose={refetch}>
                        <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
                          <Settings2 className="h-3.5 w-3.5" /> Manage
                        </span>
                      </CommandCenterManageTrigger>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refetch} />
    </div>
  );
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [comped, setComped] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    setSaving(true);
    try {
      await authedJson("/api/agency/sub-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), timezone, skipDefaultPlanAssign: comped }),
      });
      toast.success("Workspace created.");
      setName("");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create workspace.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
          <DialogDescription>
            Creates a new sub-account via the same service every other creation path in this app uses — an owner membership, welcome
            templates, and (unless comped) the agency&apos;s default plan are set up automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Plumbing" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Timezone</label>
            <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="UTC" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={comped} onChange={(e) => setComped(e.target.checked)} />
            Skip default plan assignment (comped/free)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ClientOnboardingDoc, OnboardingPackageDoc, OnboardingStatus } from "@/types/client-onboarding";

/**
 * The operator's view of every engagement.
 *
 * Sorted by what needs a human, not by date. The founder's actual question is
 * "who is stuck and who is ready", so blocked and ready-for-production float
 * to the top and everything else falls back to least-complete first.
 */

const STATUS_LABELS: Record<OnboardingStatus, string> = {
  draft: "New",
  invited: "Awaiting intake",
  in_progress: "In progress",
  blocked: "Blocked",
  ready_for_production: "Ready for production",
  completed: "Completed",
  paused: "Paused",
  cancelled: "Cancelled",
};

const PRIORITY: Record<OnboardingStatus, number> = {
  blocked: 0,
  ready_for_production: 1,
  invited: 2,
  in_progress: 3,
  draft: 4,
  paused: 5,
  completed: 6,
  cancelled: 7,
};

export function OnboardingDashboard({
  initialOnboardings,
  packages,
}: {
  initialOnboardings: ClientOnboardingDoc[];
  packages: OnboardingPackageDoc[];
}) {
  const [items, setItems] = useState(initialOnboardings);
  const [filter, setFilter] = useState<OnboardingStatus | "all">("all");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: "",
    contactEmail: "",
    contactName: "",
    packageId: packages[0]?.id ?? "",
    websiteUrl: "",
    notes: "",
    crmSubAccountId: "",
  });

  const sorted = useMemo(
    () =>
      [...items]
        .filter((o) => filter === "all" || o.status === filter)
        .sort(
          (a, b) =>
            PRIORITY[a.status] - PRIORITY[b.status] ||
            (a.completion?.overallPct ?? 0) - (b.completion?.overallPct ?? 0),
        ),
    [items, filter],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<OnboardingStatus, number>> = {};
    for (const o of items) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [items]);

  async function enroll() {
    setError(null);
    setInviteUrl(null);
    const res = await fetch("/api/agency/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json().catch(() => null)) as
      | { onboarding?: ClientOnboardingDoc; inviteUrl?: string; error?: string }
      | null;
    if (!res.ok || !data?.onboarding) {
      setError(data?.error ?? "That didn't work. Check the details and try again.");
      return;
    }
    setItems((prev) => [data.onboarding!, ...prev]);
    setInviteUrl(data.inviteUrl ?? null);
    setCreating(false);
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Client onboarding</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} engagement{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          {creating ? "Cancel" : "Start onboarding"}
        </button>
      </div>

      {inviteUrl && (
        <div className="mb-6 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-4">
          <p className="text-sm font-medium">Invite link, shown once</p>
          <p className="mt-1 break-all text-xs text-muted-foreground">{inviteUrl}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Only the hash is stored, so this cannot be read back. Re-sending mints a new
            link and kills this one.
          </p>
        </div>
      )}

      {error && (
        <p className="mb-6 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {creating && (
        <div className="mb-8 space-y-3 rounded-xl border p-5">
          {[
            ["businessName", "Business name"],
            ["contactEmail", "Contact email"],
            ["contactName", "Contact name"],
            ["websiteUrl", "Website"],
            ["crmSubAccountId", "CRM workspace id (where the contact is created)"],
            ["notes", "Notes"],
          ].map(([k, label]) => (
            <label key={k} className="block">
              <span className="mb-1 block text-sm font-medium">{label}</span>
              <input
                className="w-full rounded-lg border px-3 py-2 text-sm"
                value={String(form[k as keyof typeof form])}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              />
            </label>
          ))}
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Package</span>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={form.packageId}
              onChange={(e) => setForm((f) => ({ ...f, packageId: e.target.value }))}
            >
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void enroll()}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Enroll and create invite
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <FilterChip label={`All (${items.length})`} active={filter === "all"} onClick={() => setFilter("all")} />
        {(Object.keys(STATUS_LABELS) as OnboardingStatus[])
          .filter((s) => counts[s])
          .map((s) => (
            <FilterChip
              key={s}
              label={`${STATUS_LABELS[s]} (${counts[s]})`}
              active={filter === s}
              onClick={() => setFilter(s)}
            />
          ))}
      </div>

      {sorted.length === 0 ? (
        <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((o) => (
            <Link
              key={o.id}
              href={`/app/command-center/onboarding/${o.id}`}
              className="block rounded-xl border p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{o.businessName}</p>
                  <p className="text-sm text-muted-foreground">
                    {o.package?.name} · {STATUS_LABELS[o.status]}
                    {o.blockedReason ? ` · ${o.blockedReason}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{o.completion?.overallPct ?? 0}%</p>
                  <p className="text-xs text-muted-foreground">
                    intake {o.completion?.intakePct ?? 0}% · files {o.completion?.assetsPct ?? 0}% · access{" "}
                    {o.completion?.accessPct ?? 0}%
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
        active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
      }`}
    >
      {label}
    </button>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, AlertTriangle, HelpCircle, XCircle } from "lucide-react";
import { getCurrentAgencyOwner } from "@/lib/auth/require-agency-owner";
import { getSubAccountDoc, getWorkspaceProvisioningReport, type CommandCenterCheck } from "@/lib/server/command-center-service";
import { CommandCenterManageTrigger } from "@/components/shell/command-center-manage-trigger";
import { CommandCenterMembersPanel } from "@/components/shell/command-center-members-panel";
import { Settings2 } from "lucide-react";

const STATUS_ICON: Record<CommandCenterCheck["status"], typeof CheckCircle2> = {
  ok: CheckCircle2,
  warning: AlertTriangle,
  missing: XCircle,
  unknown: HelpCircle,
};

const STATUS_COLOR: Record<CommandCenterCheck["status"], string> = {
  ok: "text-emerald-400",
  warning: "text-amber-400",
  missing: "text-red-400",
  unknown: "text-white/30",
};

export default async function CommandCenterWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ subAccountId: string }>;
}) {
  const owner = await getCurrentAgencyOwner();
  if (!owner) notFound();

  const { subAccountId } = await params;
  const sub = await getSubAccountDoc(subAccountId);
  if (!sub || sub.agencyId !== owner.agencyId) notFound();

  const report = await getWorkspaceProvisioningReport(subAccountId);

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/app/command-center" className="text-xs text-white/40 hover:text-white/70">
            ← Command Center
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{sub.name}</h1>
          <p className="mt-1 text-sm text-white/50">#{sub.accountNumber} · {sub.status}</p>
        </div>
        <CommandCenterManageTrigger subAccountId={subAccountId}>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-white/90">
            <Settings2 className="h-4 w-4" /> Manage gates &amp; billing
          </span>
        </CommandCenterManageTrigger>
      </div>

      {!report && (
        <p className="rounded-2xl border border-white/10 p-5 text-sm text-white/50" style={{ background: "var(--glass-1)" }}>
          Could not build a provisioning report for this workspace.
        </p>
      )}

      {report && (
        <>
          {report.issues.length > 0 ? (
            <section className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5">
              <h2 className="mb-2 text-sm font-medium text-amber-300">Audit — {report.issues.length} issue{report.issues.length === 1 ? "" : "s"}</h2>
              <ul className="space-y-1.5 text-sm text-white/70">
                {report.issues.map((issue, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-amber-400">•</span>
                    {issue}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-sm text-emerald-300">
              No configuration problems detected.
            </section>
          )}

          <section className="rounded-2xl border border-white/10 p-5" style={{ background: "var(--glass-1)", backdropFilter: "blur(12px)" }}>
            <h2 className="mb-3 text-sm font-medium text-white/70">Provisioning &amp; connection status</h2>
            <ul className="divide-y divide-white/10">
              {report.checks.map((check) => {
                const Icon = STATUS_ICON[check.status];
                return (
                  <li key={check.key} className="flex items-start gap-3 py-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_COLOR[check.status]}`} />
                    <div>
                      <p className="text-sm text-white/85">{check.label}</p>
                      <p className="mt-0.5 text-xs text-white/40">{check.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      <section className="rounded-2xl bg-white p-6 text-foreground shadow-sm">
        <h2 className="mb-3 text-sm font-medium">Members &amp; invites</h2>
        <CommandCenterMembersPanel subAccountId={subAccountId} />
      </section>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Mail } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToEmailEvents } from "@/lib/firestore/email-events";
import { toDate } from "@/lib/format";
import { Panel } from "@/components/divinex/ui";
import type { EmailEventDoc } from "@/types/email-events";

/**
 * Outbound email at a glance, for Ascend's Performance page.
 *
 * Answers the question operators actually ask — "did that go out, and did
 * they read it" — without putting a full table on a page about business
 * outcomes. The detail lives one click away at /performance/email.
 *
 * Renders NOTHING when the workspace has never sent an email, so a workspace
 * not using email sees no empty card. Same restraint as the Google card
 * above it on that page.
 */
export function EmailActivitySummary() {
  const { subAccount } = useSubAccount();
  const subAccountId = subAccount?.id ?? null;
  const [rows, setRows] = useState<EmailEventDoc[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!subAccountId) return;
    return subscribeToEmailEvents(
      { subAccountId, sinceDays: 30, max: 500 },
      (next) => {
        setRows(next);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
  }, [subAccountId]);

  const stats = useMemo(() => {
    const opened = rows.filter((r) => r.openedAt).length;
    const failed = rows.filter((r) => r.bouncedAt || r.complainedAt).length;
    return { sent: rows.length, opened, failed };
  }, [rows]);

  /**
   * A 0% open rate and "the tracking webhook was never configured" are
   * indistinguishable in the data, and only one of them is a reason to
   * change how you write emails. When nothing in 30 days has any engagement
   * signal at all, show no percentage rather than a confident zero.
   */
  const trackingUnproven =
    rows.length > 0 &&
    rows.every(
      (r) => !r.openedAt && !r.clickedAt && !r.bouncedAt && !r.complainedAt,
    );

  if (!loaded || rows.length === 0) return null;

  const recent = rows.slice(0, 5);

  return (
    <Panel className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--dx-text-muted)" }}
        >
          <Mail className="h-3.5 w-3.5" /> Email, last 30 days
        </p>
        <Link
          href="/performance/email"
          className="inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: "var(--dx-primary)" }}
        >
          See every send <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Figure label="Sent" value={String(stats.sent)} />
        <Figure
          label="Opened"
          value={
            trackingUnproven
              ? "-"
              : `${stats.sent ? Math.round((stats.opened / stats.sent) * 100) : 0}%`
          }
          sub={trackingUnproven ? "not tracked yet" : `${stats.opened} of ${stats.sent}`}
        />
        <Figure
          label="Bounced"
          value={String(stats.failed)}
          tone={stats.failed > 0 ? "bad" : undefined}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {recent.map((r) => (
          <li key={r.id} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--dx-text-secondary)" }}>
              {r.subject}
              <span style={{ color: "var(--dx-text-muted)" }}>
                {" to "}
                {r.toEmail}
              </span>
            </span>
            <span className="shrink-0 tabular-nums" style={{ color: "var(--dx-text-muted)" }}>
              {r.openedAt ? "opened" : "sent"}
              {" · "}
              {toDate(r.sentAt)?.toLocaleDateString() ?? ""}
            </span>
          </li>
        ))}
      </ul>

      {trackingUnproven && (
        <p className="mt-3 text-[11px]" style={{ color: "var(--dx-text-muted)" }}>
          Open tracking is not reporting yet, so these show as sent only.
        </p>
      )}
    </Panel>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "bad";
}) {
  return (
    <div>
      <p className="text-[11px]" style={{ color: "var(--dx-text-muted)" }}>
        {label}
      </p>
      <p
        className="mt-1 text-xl font-semibold tracking-tight tabular-nums"
        style={{ color: tone === "bad" ? "var(--dx-danger, #dc2626)" : "var(--dx-text-primary)" }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-0.5 text-[11px]" style={{ color: "var(--dx-text-muted)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

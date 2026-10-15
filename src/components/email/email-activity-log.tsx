"use client";


import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Mail,
  MailOpen,
  MousePointerClick,
  ShieldAlert,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToEmailEvents } from "@/lib/firestore/email-events";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EMAIL_SOURCES, type EmailEventDoc, type EmailSource } from "@/types/email-events";

/**
 * Sent-email log — what the team sent, and what happened to it.
 *
 * ONE implementation, mounted in BOTH shells: the Flow page at
 * /sa/{id}/email-log and the Ascend route at /app/performance/email. Email
 * had already been built twice-invisible — a Flow-only sidebar entry is not
 * reachable from Ascend at all, which is how the traffic card was missed
 * earlier — and a second copy for Ascend would be a second set of numbers to
 * disagree with the first.
 *
 * This page exists because the only record of a sent email used to be a line
 * on one contact's timeline. That answers "what did we say to this person" and
 * nothing else: not what the team sent this week, not whether anyone opened
 * it, not how one rep is doing against another. Operators went looking for it
 * under Broadcasts and Performance, found nothing, and reasonably concluded
 * the sends had not happened.
 *
 * Open and click figures depend on the Resend webhook being configured; the
 * page says so plainly when no engagement data has ever arrived, rather than
 * showing a confident 0% that reads as "nobody opened it".
 */

const RANGES = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

const SOURCE_LABEL: Record<EmailSource, string> = {
  manual: "One-to-one",
  broadcast: "Broadcast",
  workflow: "Workflow",
  transactional: "Transactional",
};

export function EmailActivityLog({
  variant = "flow",
}: {
  /**
   * Which shell this is mounted in. Only affects chrome: both shells read the
   * same `emailEvents` rows through the same listener, so the numbers can
   * never disagree between Ascend and Flow.
   */
  variant?: "flow" | "ascend";
} = {}) {
  const { subAccount, saPath } = useSubAccount();
  const ascend = variant === "ascend";
  const [rows, setRows] = useState<EmailEventDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [days, setDays] = useState<number>(30);
  const [sender, setSender] = useState<string>("all");
  const [source, setSource] = useState<string>("all");

  useEffect(() => {
    if (!subAccount?.id) return;
    setLoading(true);
    setError(null);
    const unsub = subscribeToEmailEvents(
      { subAccountId: subAccount.id, sinceDays: days },
      (next) => {
        setRows(next);
        setLoading(false);
      },
      (err) => {
        // Most likely cause by far is the composite index not being built yet,
        // so name it — a bare "failed to load" sends the operator nowhere.
        setError(
          /index/i.test(err.message)
            ? "This view needs a Firestore index that is still building. It usually takes a few minutes."
            : err.message,
        );
        setLoading(false);
      },
    );
    return unsub;
  }, [subAccount?.id, days]);

  /** Everyone who has sent email in the window, for the sender filter. */
  const senders = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.sentByUid) seen.set(r.sentByUid, r.sentByEmail || r.sentByUid);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (sender === "all" || r.sentByUid === sender) &&
          (source === "all" || r.source === source),
      ),
    [rows, sender, source],
  );

  const stats = useMemo(() => {
    const sent = filtered.length;
    const opened = filtered.filter((r) => r.openedAt).length;
    const clicked = filtered.filter((r) => r.clickedAt).length;
    const failed = filtered.filter((r) => r.bouncedAt || r.complainedAt).length;
    return { sent, opened, clicked, failed };
  }, [filtered]);

  /**
   * Engagement is only meaningful once the provider webhook is delivering. If
   * NOTHING in the window has ever been opened or bounced, we cannot tell
   * "nobody engaged" apart from "tracking is not wired up" — so say so
   * instead of implying the former.
   */
  const trackingUnproven =
    rows.length > 0 &&
    rows.every((r) => !r.openedAt && !r.clickedAt && !r.bouncedAt && !r.complainedAt);

  /** Per-sender roll-up: the "how is my team doing" question. */
  const leaderboard = useMemo(() => {
    const by = new Map<
      string,
      { label: string; sent: number; opened: number; clicked: number }
    >();
    for (const r of filtered) {
      const key = r.sentByUid ?? "automated";
      const label = r.sentByUid ? r.sentByEmail || r.sentByUid : "Automated";
      const cur = by.get(key) ?? { label, sent: 0, opened: 0, clicked: 0 };
      cur.sent += 1;
      if (r.openedAt) cur.opened += 1;
      if (r.clickedAt) cur.clicked += 1;
      by.set(key, cur);
    }
    return [...by.values()].sort((a, b) => b.sent - a.sent);
  }, [filtered]);

  return (
    <div className={ascend ? "space-y-6" : "mx-auto w-full max-w-5xl space-y-6"}>
      {!ascend && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every email this workspace has sent, who sent it, and what the
            recipient did with it.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Chips
          value={String(days)}
          onChange={(v) => setDays(Number(v))}
          options={RANGES.map((r) => ({ value: String(r.days), label: r.label }))}
        />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Chips
          value={source}
          onChange={setSource}
          options={[
            { value: "all", label: "All types" },
            ...EMAIL_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] })),
          ]}
        />
        {senders.length > 1 && (
          <>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            <select
              value={sender}
              onChange={(e) => setSender(e.target.value)}
              className="rounded-full border bg-transparent px-3 py-1 text-xs"
              aria-label="Filter by sender"
            >
              <option value="all">Everyone</option>
              {senders.map(([uid, label]) => (
                <option key={uid} value={uid}>
                  {label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat icon={<Mail className="h-4 w-4" />} label="Sent" value={stats.sent} />
        <Stat
          icon={<MailOpen className="h-4 w-4" />}
          label="Opened"
          value={stats.opened}
          pct={stats.sent ? stats.opened / stats.sent : null}
          unknown={trackingUnproven}
        />
        <Stat
          icon={<MousePointerClick className="h-4 w-4" />}
          label="Clicked"
          value={stats.clicked}
          pct={stats.sent ? stats.clicked / stats.sent : null}
          unknown={trackingUnproven}
        />
        <Stat
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Bounced"
          value={stats.failed}
          tone={stats.failed > 0 ? "bad" : undefined}
        />
      </div>

      {trackingUnproven && (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          No open or click data has come in for this period. If that is
          unexpected, open and click tracking needs the Resend webhook pointed
          at <code className="font-mono">/api/webhooks/resend</code>. Until
          then, sends are logged but engagement is not.
        </p>
      )}

      {leaderboard.length > 1 && (
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">By sender</h2>
          <div className="divide-y">
            {leaderboard.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">{row.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {row.sent} sent
                  {!trackingUnproven && (
                    <>
                      {" · "}
                      {row.sent ? Math.round((row.opened / row.sent) * 100) : 0}%
                      opened
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">
          Sends{filtered.length ? ` (${filtered.length})` : ""}
        </h2>
        {loading ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "No emails sent in this period."
              : "No emails match these filters."}
          </p>
        ) : (
          <div className="divide-y">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.subject}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.contactId ? (
                      <Link
                        href={saPath(`/contacts/${r.contactId}`)}
                        className="hover:underline"
                      >
                        {r.toEmail}
                      </Link>
                    ) : (
                      r.toEmail
                    )}
                    {r.sentByEmail ? ` · ${r.sentByEmail}` : " · automated"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                  {SOURCE_LABEL[r.source] ?? r.source}
                </span>
                <StatusBadge row={r} />
                <span className="shrink-0 text-xs text-muted-foreground">
                  {toDate(r.sentAt)?.toLocaleString() ?? ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Chips({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            value === o.value
              ? "border-primary bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  pct,
  tone,
  unknown,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct?: number | null;
  tone?: "bad";
  /** True when we cannot distinguish "zero engagement" from "not tracked". */
  unknown?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "bad" && "text-destructive",
        )}
      >
        {unknown ? "-" : value}
      </p>
      {!unknown && pct !== null && pct !== undefined && (
        <p className="text-xs text-muted-foreground">{Math.round(pct * 100)}%</p>
      )}
    </div>
  );
}

function StatusBadge({ row }: { row: EmailEventDoc }) {
  const spec = row.complainedAt
    ? { label: "Complained", cls: "bg-destructive/10 text-destructive" }
    : row.bouncedAt
      ? { label: "Bounced", cls: "bg-destructive/10 text-destructive" }
      : row.clickedAt
        ? { label: "Clicked", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" }
        : row.openedAt
          ? { label: "Opened", cls: "bg-sky-500/10 text-sky-700 dark:text-sky-400" }
          : { label: "Sent", cls: "bg-muted text-muted-foreground" };
  return (
    <span
      className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", spec.cls)}
      title={row.failureDetail ?? undefined}
    >
      {spec.label}
    </span>
  );
}

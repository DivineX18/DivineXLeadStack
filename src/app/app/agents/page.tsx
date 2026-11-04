import Link from "next/link";
import { ArrowRight, CheckCircle2, AlertTriangle, MessageSquare, Phone } from "lucide-react";
import UnifiedFeature from "@/components/shell/unified-feature";
import FlowPage from "@/app/(dashboard)/sa/[subAccountId]/ai-agents/page";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { AscendSectionPage, type AscendBand } from "@/components/ascend/section-page";
import { AscendCardShell } from "@/components/ascend/card-shell";
import { MetricStrip } from "@/components/ascend/metric-card";
import { composeAgentsSummary } from "@/lib/intelligence/compose-agents-summary";

/**
 * Agents.
 *
 * This page used to be fourteen lines: UnifiedFeature wrapping Flow's AI
 * Agents page. Technically the whole feature worked, and that was the
 * problem the North Star's Priority 2 names -- a primary lifecycle section
 * that opens straight into a channel grid, where the first interactive
 * thing on production was a button reading "See warning". It answered
 * "which channels exist" and never "is my agent working, and what did it
 * do."
 *
 * Flow's page is still the execution band, unchanged and unduplicated.
 * What is added above it is the order Priority 2 asks for: where you
 * stand, the numbers, what happened, what needs attention, and only then
 * the tools. AscendSectionPage owns that order so it cannot drift.
 */
export default async function AscendAgentsPage() {
  const shell = await resolveShellContextForPage();
  const workspaceId = shell?.workspace?.workspaceId ?? null;

  if (!workspaceId) {
    return (
      <AscendSectionPlaceholder
        title="Agents"
        description="No active workspace yet. Once you're linked to one, your agent and its channels appear here."
        links={[]}
      />
    );
  }

  const result = await composeAgentsSummary(workspaceId);
  const data = result.data;

  // The execution band is the same Flow page as before, context and all.
  const executionBand: AscendBand = {
    role: "execution",
    label: "Set up your agent",
    content: (
      <UnifiedFeature title="Agents">
        <FlowPage />
      </UnifiedFeature>
    ),
  };

  // A read failure must not cost the customer the feature: Flow's page
  // reads its own data client-side and works regardless, so degrade to it
  // rather than to an error screen.
  if (!data) {
    return (
      <AscendSectionPage
        title="Agents"
        description="Your AI agent, and the channels it answers on."
        bands={[
          {
            role: "context",
            content: (
              <AscendCardShell title="We couldn't load your agent's activity" emphasis="quiet">
                <p className="text-sm text-[var(--dx-text-secondary)]">
                  Your data is safe, this is a problem reading it. Your agent and its channels are unaffected and still
                  shown below.
                </p>
              </AscendCardShell>
            ),
          },
          executionBand,
        ]}
      />
    );
  }

  const liveChannels = data.channels.filter((c) => c.enabled);
  const CHANNEL_LABELS: Record<string, string> = {
    "web-chat": "Web Chat",
    sms: "SMS",
    whatsapp: "WhatsApp",
    voice: "Voice",
  };

  // WHAT NEEDS ATTENTION, derived only from what was actually read. Each
  // entry is a real, checkable condition -- nothing is listed to fill the
  // band out.
  const attention: { text: string; href?: string; hrefLabel?: string }[] = [];
  if (!data.personaConfigured) {
    attention.push({
      text: "Your agent has no persona yet, so every channel stays silent even when its toggle is on.",
      href: "/agents",
      hrefLabel: "Write the persona",
    });
  }
  if (liveChannels.length === 0) {
    attention.push({ text: "No channel is live yet, so nothing is reaching your agent." });
  }
  if (!data.escalationEmailConfigured) {
    attention.push({
      text: "No escalation email is set, so nobody is told when the agent hands a conversation over.",
    });
  }
  if (data.pendingFollowUps > 0) {
    attention.push({
      text: `${data.pendingFollowUps} lead${data.pendingFollowUps === 1 ? "" : "s"} the agent captured ${data.pendingFollowUps === 1 ? "is" : "are"} still waiting on a follow-up.`,
      href: "/leads",
      hrefLabel: "Open Leads",
    });
  }

  const bands: AscendBand[] = [
    // 1 — CONTEXT. Which channels are actually answering, stated plainly.
    {
      role: "context",
      content: (
        <AscendCardShell
          title={liveChannels.length > 0 ? "Your agent is answering" : "Your agent isn't answering yet"}
          action={
            liveChannels.length > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--dx-primary)]" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-[var(--dx-text-muted)]" aria-hidden="true" />
            )
          }
        >
          <div className="flex flex-wrap gap-2">
            {data.channels.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                style={{
                  borderColor: "var(--dx-border-subtle)",
                  color: c.enabled ? "var(--dx-text-primary)" : "var(--dx-text-muted)",
                  backgroundColor: c.enabled ? "var(--dx-surface-2)" : "transparent",
                }}
              >
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: c.enabled ? "var(--dx-primary)" : "var(--dx-text-muted)" }}
                />
                {CHANNEL_LABELS[c.id] ?? c.id}
                <span className="sr-only">{c.enabled ? " is live" : " is off"}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-[var(--dx-text-secondary)]">
            {liveChannels.length > 0
              ? `One persona answers across ${liveChannels.length} live channel${liveChannels.length === 1 ? "" : "s"}. Captured leads become contacts and a follow-up task.`
              : "Turn on a channel below and your agent starts answering on it with the same persona."}
          </p>
        </AscendCardShell>
      ),
    },

    // 2 — INSIGHTS. Seven days, because an agent's value is recent volume.
    {
      role: "insights",
      label: "Last 7 days",
      content: (
        <MetricStrip
          meta={result.meta}
          metrics={[
            { label: "Conversations", value: String(data.conversationsLast7) },
            { label: "Leads captured", value: String(data.capturedLeadsLast7) },
            { label: "Voice calls", value: String(data.voiceCallsLast7) },
            { label: "Handed to a human", value: String(data.escalatedLast7) },
          ]}
        />
      ),
    },
  ];

  // 3 — ACTIVITY. Omitted entirely when there is none: an empty band
  // teaches the customer that the section is decorative.
  if (data.recent.length > 0) {
    bands.push({
      role: "activity",
      // "Recent" has to be TRUE. The insights band counts the last 7 days,
      // so a workspace whose last conversation was in September showed
      // "Conversations 0" directly above six listed conversations, which
      // reads as a contradiction rather than as history.
      label: data.conversationsLast7 > 0 ? "Recent conversations" : "Earlier conversations",
      href: "/agents",
      hrefLabel: "All channels",
      content: (
        <AscendCardShell emphasis="quiet">
          <ul className="divide-y" style={{ borderColor: "var(--dx-border-subtle)" }}>
            {data.recent.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                {item.kind === "voice" ? (
                  <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
                ) : (
                  <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--dx-text-primary)]">
                    {item.who ?? (item.kind === "voice" ? "Caller" : "Anonymous visitor")}
                    {item.needsFollowUp && (
                      <span className="ml-2 text-xs font-medium" style={{ color: "var(--dx-primary)" }}>
                        needs follow-up
                      </span>
                    )}
                  </p>
                  {item.detail && <p className="truncate text-xs text-[var(--dx-text-muted)]">{item.detail}</p>}
                </div>
                {item.at !== null && (
                  <time
                    className="shrink-0 text-xs text-[var(--dx-text-muted)]"
                    dateTime={new Date(item.at).toISOString()}
                  >
                    {new Date(item.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </time>
                )}
              </li>
            ))}
          </ul>
        </AscendCardShell>
      ),
    });
  }

  // 4 — RECOMMENDATIONS. Only when something is genuinely wrong.
  if (attention.length > 0) {
    bands.push({
      role: "recommendations",
      label: "What needs attention",
      content: (
        <AscendCardShell emphasis="quiet">
          <ul className="space-y-2.5">
            {attention.map((a) => (
              <li key={a.text} className="flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--dx-text-muted)]" aria-hidden="true" />
                <p className="text-sm text-[var(--dx-text-secondary)]">
                  {a.text}
                  {a.href && (
                    <Link
                      href={a.href}
                      className="ml-1.5 inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: "var(--dx-primary)" }}
                    >
                      {a.hrefLabel ?? "Open"} <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </AscendCardShell>
      ),
    });
  }

  bands.push(executionBand);

  return (
    <AscendSectionPage
      title="Agents"
      description="Your AI agent, and the channels it answers on."
      bands={bands}
    />
  );
}

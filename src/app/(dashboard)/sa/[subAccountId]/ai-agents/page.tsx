"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Bot, ChevronDown } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { VISIBLE_AI_CHANNELS } from "@/components/ai-agents/channels";
import { ChannelStatusCard } from "@/components/ai-agents/channel-status-card";
import { AgentProfileSection } from "@/components/ai-agents/agent-profile-section";
import type { AiChannelConfig } from "@/types/ai";

/**
 * AI Agents Overview — hosts the Agent Profile editor (shared persona)
 * and a status grid of every visible channel.
 *
 * Per-channel "enabled" state shown on each card is pulled from each
 * channel's config doc. As channels graduate from comingSoon, add their
 * fetch alongside the SMS one here.
 */
export default function AiAgentsOverviewPage() {
  const { subAccountId, subAccount, inAscendShell } = useSubAccount();
  const Heading = inAscendShell ? "h2" : "h1";
  const [smsConfig, setSmsConfig] = useState<AiChannelConfig | null>(null);
  const [voiceConfig, setVoiceConfig] = useState<AiChannelConfig | null>(null);
  const [whatsappConfig, setWhatsappConfig] = useState<AiChannelConfig | null>(
    null,
  );
  const [webChatConfig, setWebChatConfig] = useState<AiChannelConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [smsRes, voiceRes, whatsappRes, webChatRes] = await Promise.all([
          fetch(`/api/sub-accounts/${subAccountId}/ai-agent/channels/sms`),
          fetch(`/api/sub-accounts/${subAccountId}/ai-agent/channels/voice`),
          fetch(`/api/sub-accounts/${subAccountId}/ai-agent/channels/whatsapp`),
          // WEB CHAT WAS NEVER FETCHED. The grid passed `enabled: undefined`
          // for it, which this card renders as "Not configured" -- so a
          // workspace with Web Chat live and hundreds of thousands of tokens
          // spent on it still read "Not configured" on the overview, every
          // time. The header comment on this file asked for exactly this
          // ("as channels graduate from comingSoon, add their fetch
          // alongside the SMS one"); Web Chat graduated and nobody did.
          fetch(`/api/sub-accounts/${subAccountId}/ai-agent/channels/web-chat`),
        ]);
        const smsData = smsRes.ok
          ? ((await smsRes.json()) as { config: AiChannelConfig | null })
          : { config: null };
        const voiceData = voiceRes.ok
          ? ((await voiceRes.json()) as { config: AiChannelConfig | null })
          : { config: null };
        const whatsappData = whatsappRes.ok
          ? ((await whatsappRes.json()) as { config: AiChannelConfig | null })
          : { config: null };
        const webChatData = webChatRes.ok
          ? ((await webChatRes.json()) as { config: AiChannelConfig | null })
          : { config: null };
        if (!cancelled) {
          setWebChatConfig(webChatData.config);
          setSmsConfig(smsData.config);
          setVoiceConfig(voiceData.config);
          setWhatsappConfig(whatsappData.config);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  const dedicatedSmsConfigured = !!subAccount?.twilioConfig?.enabled;
  const smsEnabled = !!smsConfig?.enabled && dedicatedSmsConfigured;
  const voiceEnabled = !!voiceConfig?.enabled && dedicatedSmsConfigured;
  const whatsappSenderConfigured =
    !!subAccount?.twilioConfig?.whatsappFromNumber;
  const whatsappEnabled =
    !!whatsappConfig?.enabled &&
    whatsappSenderConfigured &&
    subAccount?.whatsappEnabledByAgency === true;

  // Web Chat needs no per-workspace provisioning the way SMS/WhatsApp/Voice
  // need a Twilio number, so its own toggle is the whole story.
  const webChatEnabled = !!webChatConfig?.enabled;

  // Overview grid shows the inbound channels only — Outbound has its own
  // tab + config and isn't a shared-persona inbound channel.
  const channelsForGrid = VISIBLE_AI_CHANNELS.filter(
    (c) => c.id !== "overview" && c.group === "inbound",
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 via-violet-500/15 to-pink-500/15 text-primary">
          <Bot className="h-6 w-6" />
        </span>
        <div>
          {/* ONE <h1> PER PAGE. In Flow this page IS the page. In the Ascend
              shell it renders as the execution band of /agents, under that
              section's own <h1>, so a second one here would give the page two
              top-level headings and break the document outline for anyone
              navigating by heading. */}
          <Heading className="text-2xl font-semibold tracking-tight">AI Agents</Heading>
          <p className="mt-1 text-sm text-muted-foreground">
            One persona, every channel. Configure the agent below, channels
            inherit and can override specific settings.
          </p>
        </div>
      </header>

      {!dedicatedSmsConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 text-sm text-amber-800 dark:text-amber-400">
          <button
            type="button"
            onClick={() => setWarningOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left font-medium"
            aria-expanded={warningOpen}
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              {warningOpen ? "Set up SMS first" : "See warning"}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform ${warningOpen ? "rotate-180" : ""}`}
            />
          </button>
          {warningOpen && (
            <div className="border-t border-amber-500/20 px-4 py-3 font-normal">
              AI Agents need a dedicated Twilio number to send from. Enable
              one in{" "}
              <a
                href="dashboard/settings"
                className="underline-offset-2 hover:underline"
              >
                Settings &rarr; SMS
              </a>{" "}
              before turning on any channel.
            </div>
          )}
        </div>
      )}

      <AgentProfileSection />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Channels
        </h2>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">
            Loading channel status…
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channelsForGrid.map((channel) => (
              <ChannelStatusCard
                key={channel.id}
                channel={channel}
                enabled={
                  channel.id === "web-chat"
                    ? webChatEnabled
                    : channel.id === "sms"
                    ? smsEnabled
                    : channel.id === "voice"
                      ? voiceEnabled
                      : channel.id === "whatsapp"
                        ? whatsappEnabled
                        : undefined
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

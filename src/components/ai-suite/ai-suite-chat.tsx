"use client";

import { useEffect, useRef, useState } from "react";
import { describeZenoFailure } from "@/lib/ai-suite/failure-message";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Eye,
  Pencil,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiSuiteMarkdown } from "@/components/ai-suite/ai-suite-markdown";
import { cn } from "@/lib/utils";
import type {
  AiSuiteChatMessage,
  AiSuiteChatResponse,
  AiSuiteLevel,
} from "@/types/ai-suite";

interface AiSuiteChatProps {
  level: AiSuiteLevel;
  /** Required for sub-account level; passed through to the API for auth. */
  subAccountId?: string;
  /** Fires with true once the thread has any messages, false when it's back
   *  to the empty landing state — lets the page hide the scope banner while
   *  chatting and restore it on New chat. */
  onActiveChange?: (active: boolean) => void;
  /** VISUAL EDITOR CONTEXT. When the chat is opened from inside a funnel
   *  editor, the artifact + selected section travel with every message so Zeno
   *  reasons about the customer's ACTUAL draft rather than regenerating from a
   *  title. Re-resolved and ownership-checked server-side — never trusted. */
  /** The asset on screen. `kind` is any Flow domain the server registry
   *  knows; it is a HINT only, re-resolved and ownership-proved server-side
   *  (see lib/ai-suite/flow-domains.ts), so an unknown kind resolves to
   *  nothing rather than being trusted. */
  artifactRef?: { kind: string; id: string; sectionId?: string | null };
  /** Pre-fills the input when another surface hands work over (a
   *  recommendation's "Fix with Zeno", say). SEEDS ONLY — never auto-sends,
   *  so the customer reads and chooses. Re-seeding with the same text is a
   *  no-op; a new request replaces an unsent draft. */
  seedPrompt?: string | null;
}

type ProposalStatus = "pending" | "confirmed" | "cancelled" | "failed";

type UiMessage =
  | { role: "user"; kind: "text"; content: string }
  | { role: "assistant"; kind: "text"; content: string }
  | {
      role: "assistant";
      kind: "navigate";
      content: string;
      href: string;
      label: string;
    }
  | {
      role: "assistant";
      kind: "proposal";
      id: string;
      capability: string;
      args: Record<string, unknown>;
      summary: string;
      status: ProposalStatus;
      resultText?: string;
      /** BUILD COMPLETION CONTRACT (Production Experience 2.0): what Zeno
       *  actually built. The confirm route has always returned this; the UI
       *  previously discarded it, which is why a successful funnel build
       *  looked like nothing happened. */
      resultRef?: { kind: string; id: string } | null;
    };

/**
 * What Zeno just built, with the actions that prove it exists. Draft
 * funnels route to the ONE canonical preview (drafts render there and
 * nowhere else); workflows route to their builder, where the human Publish
 * boundary lives.
 */
function BuildResult({
  resultRef,
}: {
  resultRef: { kind: string; id: string } | null;
}) {
  if (!resultRef?.id) return null;

  if (resultRef.kind === "funnel") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
        <p className="text-xs font-semibold">Your funnel is ready</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          It is saved as a draft. Nothing is public until you publish it.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            size="sm"
            render={<Link href={`/preview/funnel/${resultRef.id}`} />}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview funnel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            render={<Link href={`/app/create/funnel/${resultRef.id}`} />}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            render={<Link href="/app/create" />}
          >
            Open Create
          </Button>
        </div>
      </div>
    );
  }

  if (resultRef.kind === "form") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
        <p className="text-xs font-semibold">Your form is live</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          Share the link or embed it, every submission becomes a contact here.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            size="sm"
            render={<Link href={`/f/${resultRef.id}`} target="_blank" />}
          >
            <Eye className="mr-1.5 h-3.5 w-3.5" /> Open form
          </Button>
          <Button
            size="sm"
            variant="secondary"
            render={<Link href="/app/create/forms" />}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
          </Button>
        </div>
      </div>
    );
  }

  if (resultRef.kind === "booking_page") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
        <p className="text-xs font-semibold">Your booking page is ready</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          It is a draft. Check the hours match when you actually take
          appointments, then publish it.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button size="sm" render={<Link href="/app/create/booking" />}>
            Review availability
          </Button>
        </div>
      </div>
    );
  }

  if (resultRef.kind === "workflow") {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3">
        <p className="text-xs font-semibold">Your follow-up is ready</p>
        <p className="text-muted-foreground mt-0.5 text-[11px]">
          Saved as a draft. It cannot contact anyone until you publish it.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            size="sm"
            render={<Link href={`/app/create/workflows/${resultRef.id}`} />}
          >
            Review follow-up
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

const LANDING_COPY: Record<AiSuiteLevel, { heading: string; sub: string }> = {
  agency: {
    heading: "Ask about running your agency, or ask me to do a few things",
    sub: "I explain how the platform works, and I can create sub-accounts or change a client's feature gates (you confirm before anything happens).",
  },
  "sub-account": {
    heading: "Ask how to use this workspace, or ask me to do a few things",
    sub: "I explain features, and I can create contacts, tasks, or workflows in this client (you confirm before anything happens).",
  },
};

const AGENCY_SUGGESTIONS = [
  "Which sub-accounts have API access enabled?",
  "How many contacts does my biggest client have?",
  "Enable broadcasts for one of my sub-accounts",
  "Set up a community for one of my clients",
];

const SUB_ACCOUNT_SUGGESTIONS = [
  "Set up a webhook to my n8n workflow",
  "Do I have a contact named Jane Doe?",
  "Which workspaces can I access?",
  "Add a task to call Jane Doe tomorrow",
];

/** History sent to the model — proposals collapse to a short status line. */
function toApiHistory(messages: UiMessage[]): AiSuiteChatMessage[] {
  return messages.map((m) => {
    if (m.kind === "text") return { role: m.role, content: m.content };
    if (m.kind === "navigate") {
      return {
        role: "assistant" as const,
        content: `${m.content} (showed an "${m.label}" button)`,
      };
    }
    // proposal (always assistant)
    //
    // WHAT HAPPENED, NOT THAT SOMETHING HAPPENED.
    //
    // A failed action used to come back as "<summary> (this action failed)",
    // dropping resultText, which is the only place the actual reason lives.
    // A turn later the model knew an action had failed but not what or why,
    // so it hedged: it told the customer to go and check whether a change it
    // had already been told did not happen had gone through. The outcome is
    // stated plainly here, and the reason travels with it.
    const status =
      m.status === "confirmed"
        ? m.resultText || m.summary
        : m.status === "cancelled"
          ? `${m.summary} (cancelled by the user, so nothing changed)`
          : m.status === "failed"
            ? `${m.summary} DID NOT HAPPEN. Nothing was changed. Reason: ${
                m.resultText || "the action could not be completed"
              }`
            : `${m.summary} (awaiting the user's confirmation, nothing has changed yet)`;
    return { role: "assistant", content: status };
  });
}

function threadQuery(level: AiSuiteLevel, subAccountId?: string): string {
  const qs = new URLSearchParams({ level });
  if (subAccountId) qs.set("subAccountId", subAccountId);
  return qs.toString();
}

export function AiSuiteChat({
  level,
  subAccountId,
  onActiveChange,
  artifactRef,
  seedPrompt,
}: AiSuiteChatProps) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // QA BUG-004 — which saved conversation this thread autosaves into. Null
  // until the first message of a brand-new conversation is saved, at which
  // point the server mints one and hands its id back.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<
    | { id: string; title: string; updatedAt: string | null; active: boolean }[]
    | null
  >(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const suggestions =
    level === "agency" ? AGENCY_SUGGESTIONS : SUB_ACCOUNT_SUGGESTIONS;
  const landing = LANDING_COPY[level];

  // Restore the saved thread on mount so a refresh doesn't lose the
  // conversation (or a pending proposal — confirming re-validates
  // everything server-side, so restored proposals stay actionable).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ai-suite/thread?${threadQuery(level, subAccountId)}`
        );
        const data = (await res.json().catch(() => null)) as {
          messages?: UiMessage[];
          sessionId?: string | null;
        } | null;
        if (!cancelled && res.ok && Array.isArray(data?.messages)) {
          setMessages(data.messages);
          setSessionId(data?.sessionId ?? null);
        }
      } catch {
        /* start fresh */
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [level, subAccountId]);

  // Persist the thread (debounced) after every change. Empty threads are
  // never PUT — clearing goes through the explicit DELETE in newChat().
  // Carries the open session id so repeated autosaves update the SAME
  // conversation instead of forking a new one each tick; the server hands
  // one back the first time (a brand-new conversation) and that's stored
  // for every save after.
  useEffect(() => {
    if (!hydrated || messages.length === 0) return;
    const t = setTimeout(() => {
      void fetch("/api/ai-suite/thread", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, subAccountId, messages, sessionId }),
      })
        .then((res) => res.json())
        .then((data: { sessionId?: string }) => {
          if (data?.sessionId && data.sessionId !== sessionId)
            setSessionId(data.sessionId);
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
    // sessionId intentionally omitted — it's written back above without
    // re-triggering this effect, or every autosave response would queue
    // another identical save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, hydrated, level, subAccountId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading]);

  // Report empty↔active to the page (which hides the scope banner while
  // chatting). Only after hydration, so a restored thread doesn't flash the
  // banner before its saved messages land.
  useEffect(() => {
    if (hydrated) onActiveChange?.(messages.length > 0);
  }, [hydrated, messages.length, onActiveChange]);

  // Seed the input when a surface hands work over. Never sends: the customer
  // reads it, edits it, or closes the panel and nothing has happened.
  useEffect(() => {
    if (seedPrompt) setInput(seedPrompt);
  }, [seedPrompt]);

  function newChat() {
    if (loading || confirmingId) return;
    setMessages([]);
    setSessionId(null);
    setError(null);
    // Only clears which conversation is OPEN. The one just left is kept
    // (see thread-store.ts) — it's in History, not deleted.
    void fetch(`/api/ai-suite/thread?${threadQuery(level, subAccountId)}`, {
      method: "DELETE",
    }).catch(() => {});
  }

  async function openHistory() {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/ai-suite/thread/sessions?${threadQuery(level, subAccountId)}`
      );
      const data = (await res.json().catch(() => null)) as {
        sessions?: {
          id: string;
          title: string;
          updatedAt: string | null;
          active: boolean;
        }[];
      } | null;
      setHistoryItems(res.ok ? (data?.sessions ?? []) : []);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function reopenSession(id: string) {
    if (loading || confirmingId) return;
    try {
      const res = await fetch(
        `/api/ai-suite/thread/sessions/${id}?${threadQuery(level, subAccountId)}`
      );
      const data = (await res.json().catch(() => null)) as {
        messages?: UiMessage[];
        sessionId?: string;
      } | null;
      if (res.ok && Array.isArray(data?.messages)) {
        setMessages(data.messages);
        setSessionId(data?.sessionId ?? id);
        setError(null);
      }
    } catch {
      /* leave the current thread as-is */
    } finally {
      setHistoryOpen(false);
    }
  }

  async function send(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setError(null);
    setInput("");

    const next: UiMessage[] = [
      ...messages,
      { role: "user", kind: "text", content: trimmed },
    ];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/ai-suite/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          subAccountId,
          messages: toApiHistory(next),
          // P0.6 Phase 2 — WHERE the customer is, nothing more. The server
          // normalizes this against the IA whitelist and decides what may be
          // known there. Never send profile, brand or artifact CONTENTS from
          // the browser: the server reads those from authority itself.
          pageContext: {
            route:
              typeof window !== "undefined"
                ? window.location.pathname
                : undefined,
            ...(artifactRef
              ? {
                  artifactRef: {
                    kind: artifactRef.kind,
                    id: artifactRef.id,
                    ...(artifactRef.sectionId
                      ? { sectionId: artifactRef.sectionId }
                      : {}),
                  },
                }
              : {}),
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | (AiSuiteChatResponse & { error?: string })
        | { error?: string }
        | null;
      if (!res.ok || !data) {
        // A chat turn reads and proposes; it never writes. So this can say
        // plainly that nothing changed. See lib/ai-suite/failure-message.ts.
        throw new Error(
          describeZenoFailure({
            status: res.status,
            stage: "chat",
            serverMessage: (data as { error?: string })?.error ?? null,
          })
        );
      }

      if ("type" in data && data.type === "proposal") {
        const p = data.proposal;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            kind: "proposal",
            id: p.id,
            capability: p.capability,
            args: p.args,
            summary: p.summary,
            status: "pending",
          },
        ]);
      } else if ("type" in data && data.type === "navigate") {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            kind: "navigate",
            content: data.text,
            href: data.href,
            label: data.label,
          },
        ]);
      } else if ("type" in data && data.type === "message") {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", kind: "text", content: data.text },
        ]);
      } else {
        throw new Error("Unexpected response from the assistant.");
      }
    } catch (err) {
      // A thrown fetch never reached the server, so the turn did not run.
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "I couldn't reach the server. Check your connection and ask me again. Nothing was changed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function confirmProposal(id: string) {
    const msg = messages.find(
      (m): m is Extract<UiMessage, { kind: "proposal" }> =>
        m.kind === "proposal" && m.id === id
    );
    // "failed" is retryable on purpose: a build that fell over on a
    // transient error must not become a dead end the customer can only
    // escape by retyping the whole request.
    if (
      !msg ||
      (msg.status !== "pending" && msg.status !== "failed") ||
      confirmingId
    )
      return;
    setError(null);
    setConfirmingId(id);
    try {
      const res = await fetch("/api/ai-suite/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level,
          subAccountId,
          capability: msg.capability,
          args: msg.args,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        resultText?: string;
        resultRef?: { kind: string; id: string } | null;
        error?: string;
      } | null;
      if (!res.ok || !data?.ok) {
        // This one IS the write, so what it may claim about state depends on
        // whether the change was refused or faulted part-way.
        throw new Error(
          describeZenoFailure({
            status: res.status,
            stage: "confirm",
            serverMessage: data?.error ?? null,
          })
        );
      }
      updateProposal(id, {
        status: "confirmed",
        resultText: data.resultText,
        resultRef: data.resultRef ?? null,
      });
    } catch (err) {
      // A thrown fetch (offline, DNS, the tab losing the network) never
      // reached the server, so nothing ran.
      const m =
        err instanceof Error && err.message.trim()
          ? err.message
          : "I couldn't reach the server, so that didn't run. Check your connection and try again. Nothing was changed.";
      updateProposal(id, { status: "failed", resultText: m });
    } finally {
      setConfirmingId(null);
    }
  }

  function updateProposal(
    id: string,
    patch: {
      status: ProposalStatus;
      resultText?: string;
      resultRef?: { kind: string; id: string } | null;
    }
  ) {
    setMessages((prev) =>
      prev.map((m) =>
        m.kind === "proposal" && m.id === id ? { ...m, ...patch } : m
      )
    );
  }

  const empty = messages.length === 0;

  // The input is rendered in two places — centered on the empty "landing"
  // state, and docked at the bottom once the thread starts — so it's defined
  // once here and placed by the layout below.
  const inputForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send(input);
      }}
      className="flex items-end gap-2"
    >
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void send(input);
          }
        }}
        rows={1}
        autoFocus
        placeholder="Ask a question, or ask me to create something…"
        disabled={loading}
        className="bg-background focus-visible:ring-ring max-h-32 flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:opacity-60"
      />
      <Button
        type="submit"
        size="icon"
        disabled={loading || !input.trim()}
        aria-label="Send"
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );

  if (!hydrated) {
    return (
      <div className="bg-card flex h-full min-h-[24rem] items-center justify-center rounded-xl border">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  const historyButton = (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => void openHistory()}
      className="text-muted-foreground h-7 gap-1.5 text-xs"
      aria-label="Conversation history"
    >
      <HistoryIcon className="h-3.5 w-3.5" />
      History
    </Button>
  );

  return (
    <div className="bg-card relative flex h-full min-h-[24rem] flex-col rounded-xl border">
      {historyOpen && (
        <div className="bg-card absolute inset-0 z-20 flex flex-col rounded-xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <p className="text-sm font-medium">Conversation history</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setHistoryOpen(false)}
              className="h-7 w-7 p-0"
              aria-label="Close history"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {historyLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              </div>
            ) : !historyItems || historyItems.length === 0 ? (
              <p className="text-muted-foreground p-3 text-xs">
                No past conversations yet. Starting a new chat will save this
                one here.
              </p>
            ) : (
              <ul className="space-y-1">
                {historyItems.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => void reopenSession(s.id)}
                      className={cn(
                        "hover:bg-muted flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors",
                        s.active && "bg-muted/60"
                      )}
                    >
                      <span className="truncate text-sm">{s.title}</span>
                      {s.updatedAt && (
                        <span className="text-muted-foreground text-[11px]">
                          {new Date(s.updatedAt).toLocaleString()}
                          {s.active ? " · current" : ""}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {empty ? (
        // ── Landing state: greeting + input centered, suggestions beneath ──
        <div className="flex flex-1 flex-col">
          <div className="flex items-center justify-end border-b px-3 py-1.5">
            {historyButton}
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="text-primary flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 via-violet-500/15 to-pink-500/15">
                <Sparkles className="h-6 w-6" />
              </span>
              <div>
                <p className="text-base font-medium">{landing.heading}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {landing.sub}
                </p>
              </div>
            </div>

            <div className="w-full max-w-xl">{inputForm}</div>

            {error && <p className="text-destructive text-xs">{error}</p>}

            <div className="flex max-w-xl flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-full border px-3 py-1.5 text-xs transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        // ── Thread state: scrolling messages + docked input ──
        <>
          <div className="flex items-center justify-between border-b px-3 py-1.5">
            {historyButton}
            <Button
              size="sm"
              variant="ghost"
              onClick={newChat}
              disabled={loading || !!confirmingId}
              className="text-muted-foreground h-7 gap-1.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              New chat
            </Button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.map((m, i) => {
              if (m.kind === "navigate") {
                return (
                  <div key={i} className="flex gap-3">
                    <span className="bg-primary/10 text-primary mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="bg-muted max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed">
                      <p>{m.content}</p>
                      <Link
                        href={m.href}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-2.5 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        {m.label.replace(/\s*→\s*$/, "")}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                );
              }
              if (m.kind === "proposal") {
                return (
                  <ProposalCard
                    key={m.id}
                    msg={m}
                    busy={confirmingId === m.id}
                    onConfirm={() => confirmProposal(m.id)}
                    onCancel={() =>
                      updateProposal(m.id, { status: "cancelled" })
                    }
                  />
                );
              }
              return (
                <div
                  key={i}
                  className={cn(
                    "flex gap-3",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  {m.role === "assistant" && (
                    <span className="bg-primary/10 text-primary mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <Sparkles className="h-4 w-4" />
                    </span>
                  )}
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {m.role === "assistant" ? (
                      <AiSuiteMarkdown text={m.content} />
                    ) : (
                      m.content
                    )}
                  </div>
                  {m.role === "user" && (
                    <span className="bg-muted text-muted-foreground mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                      <User className="h-4 w-4" />
                    </span>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Thinking…
              </div>
            )}
          </div>

          {error && (
            <div className="border-destructive/30 bg-destructive/5 text-destructive border-t px-4 py-2 text-xs">
              {error}
            </div>
          )}

          <div className="border-t p-3">{inputForm}</div>
        </>
      )}
    </div>
  );
}

/** Render http(s) URLs in an action result as clickable links. */
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function ProposalCard({
  msg,
  busy,
  onConfirm,
  onCancel,
}: {
  msg: Extract<UiMessage, { kind: "proposal" }>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-3">
      <span className="bg-primary/10 text-primary mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="bg-muted/40 max-w-[80%] flex-1 rounded-2xl border px-4 py-3 text-sm">
        <p className="text-foreground font-medium">{msg.summary}</p>

        {msg.status === "pending" && (
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={onConfirm} disabled={busy}>
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Confirm
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={busy}
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
          </div>
        )}

        {msg.status === "confirmed" && (
          <>
            <p className="mt-2 flex items-start gap-1.5 text-xs whitespace-pre-wrap text-emerald-600 dark:text-emerald-400">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                {linkify(msg.resultText || "Done.")}
              </span>
            </p>
            {/* BUILD COMPLETION CONTRACT: if Zeno built something, the
                customer sees it and can open it immediately. Never a
                silent success that leaves them hunting a list. */}
            <BuildResult resultRef={msg.resultRef ?? null} />
          </>
        )}
        {msg.status === "cancelled" && (
          <p className="text-muted-foreground mt-2 text-xs">Cancelled.</p>
        )}
        {msg.status === "failed" && (
          <div className="mt-2">
            <p className="text-destructive flex items-start gap-1.5 text-xs">
              <X className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">
                {msg.resultText || "The action failed."}
              </span>
            </p>
            {/* Nothing was saved, so retrying is safe and cannot duplicate
                work, say so, then offer the retry. A failure with no way
                forward is the state customers get stuck in. */}
            <p className="text-muted-foreground mt-1 text-[11px]">
              Nothing was created, so it&apos;s safe to try again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Try again
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onCancel}
                disabled={busy}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

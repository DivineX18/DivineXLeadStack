"use client";

import { useState } from "react";
import { Inbox, MessageCircle, Receipt, Users2, LineChart } from "lucide-react";
import { cn } from "@/lib/utils";

type StageKey = "capture" | "convert" | "deliver" | "retain" | "understand";

interface StageDetail {
  key: StageKey;
  label: string;
  icon: typeof Inbox;
  headline: string;
  body: string;
  items: string[];
}

const STAGES: StageDetail[] = [
  {
    key: "capture",
    label: "Capture",
    icon: Inbox,
    headline: "Every lead lands somewhere real",
    body: "A form on your site, a booking page, or a web chat widget — every one writes straight into a contact record, with the campaign it came from attached.",
    items: ["Drag-and-drop lead forms", "Public booking pages", "Web chat lead capture", "UTM + campaign attribution"],
  },
  {
    key: "convert",
    label: "Convert",
    icon: MessageCircle,
    headline: "Someone — or something — answers immediately",
    body: "A form submit can trigger an SMS and email within seconds. An AI agent can answer chat, SMS, WhatsApp, and calls around the clock, and every deal moves through a real pipeline.",
    items: ["AI agents across chat, SMS, WhatsApp, voice", "Speed-to-lead automation", "Six-stage sales pipeline", "Outbound calling campaigns"],
  },
  {
    key: "deliver",
    label: "Deliver",
    icon: Receipt,
    headline: "Getting paid, without the back-and-forth",
    body: "Send a line-itemed quote and the client can accept or pay right from their inbox. Bookings get an automatic ICS confirmation and reminders send themselves.",
    items: ["Quotes clients accept from their inbox", "Automatic booking confirmations", "PayPal payment links", "Reminder + reschedule handling"],
  },
  {
    key: "retain",
    label: "Retain",
    icon: Users2,
    headline: "Every client's history, in one place",
    body: "Notes, messages, bookings, and quotes merge into one activity timeline per contact — so follow-up doesn't depend on anyone's memory.",
    items: ["Unified contact activity timeline", "Tasks linked to contacts", "Bulk email broadcasts", "Two-way SMS + WhatsApp threads"],
  },
  {
    key: "understand",
    label: "Understand",
    icon: LineChart,
    headline: "See what's actually working",
    body: "Date-range KPIs, a pipeline funnel, a won-revenue trend, and a leads-by-source breakdown — without exporting anything to a spreadsheet.",
    items: ["Pipeline funnel + won-revenue trend", "Leads-by-source breakdown", "Date-range KPI reporting", "Public API for custom reporting"],
  },
];

export function BusinessOperatingSystem() {
  const [active, setActive] = useState<StageKey>("capture");
  const stage = STAGES.find((s) => s.key === active)!;

  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">Your Business Operating System</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Follow a lead{" "}
            <span className="font-serif font-normal italic">from first contact to understood</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            The same five stages every lead moves through — reading from the same record the whole way.
          </p>
        </div>

        {/* Stage rail */}
        <div className="mx-auto mt-12 flex max-w-3xl items-center justify-between">
          {STAGES.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center">
              <button
                onClick={() => setActive(s.key)}
                className="flex flex-col items-center gap-2 outline-none"
                aria-pressed={active === s.key}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors sm:h-12 sm:w-12",
                    active === s.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/50",
                  )}
                >
                  <s.icon className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    "text-xs font-medium sm:text-sm",
                    active === s.key ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              </button>
              {i < STAGES.length - 1 && (
                <div className="mx-1 h-px flex-1 bg-border sm:mx-2" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        {/* Detail panel */}
        <div className="mx-auto mt-10 max-w-3xl rounded-2xl border bg-card p-6 sm:p-8">
          <div className="grid gap-6 sm:grid-cols-2 sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{stage.label}</p>
              <h3 className="mt-1 text-xl font-semibold tracking-tight">{stage.headline}</h3>
              <p className="mt-2.5 text-sm text-muted-foreground">{stage.body}</p>
            </div>
            <ul className="space-y-2.5 sm:border-l sm:pl-6">
              {stage.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span className="text-foreground/90">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

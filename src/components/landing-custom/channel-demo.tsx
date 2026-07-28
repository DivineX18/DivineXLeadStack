"use client";

import { useState } from "react";
import { MessageSquareText, MessageCircle, Phone, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";

type ChannelKey = "webchat" | "sms" | "whatsapp" | "voice";

interface Turn {
  from: "visitor" | "agent";
  text: string;
}

const CHANNELS: { key: ChannelKey; label: string; icon: typeof MessageSquareText; window: string; turns: Turn[] }[] = [
  {
    key: "webchat",
    label: "Web Chat",
    icon: MessageSquareText,
    window: "yoursite.com",
    turns: [
      { from: "visitor", text: "Do you do same-day estimates?" },
      { from: "agent", text: "Yes — I can get you booked for today. What's the address and best number to reach you?" },
    ],
  },
  {
    key: "sms",
    label: "SMS",
    icon: Smartphone,
    window: "(555) 019-4482",
    turns: [
      { from: "visitor", text: "hey saw your ad, still doing free quotes?" },
      { from: "agent", text: "Yes! Send your address and I'll get an estimate window booked today." },
    ],
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircle,
    window: "Business Account",
    turns: [
      { from: "visitor", text: "Is anyone available this weekend?" },
      { from: "agent", text: "We have Saturday morning slots open — want me to book one for you now?" },
    ],
  },
  {
    key: "voice",
    label: "Voice",
    icon: Phone,
    window: "Inbound call · 0:14",
    turns: [
      { from: "visitor", text: "\"Hi, I'm calling about getting a quote...\"" },
      { from: "agent", text: "\"Happy to help — can I grab your address and a callback number?\"" },
    ],
  },
];

export function ChannelDemo() {
  const [active, setActive] = useState<ChannelKey>("webchat");
  const channel = CHANNELS.find((c) => c.key === active)!;

  return (
    <div className="mx-auto max-w-md">
      <div className="flex justify-center gap-1.5 mb-4">
        {CHANNELS.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active === c.key
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <channel.icon className="h-3.5 w-3.5" />
          {channel.window}
        </div>
        <div className="space-y-2.5 p-4">
          {channel.turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm",
                turn.from === "visitor"
                  ? "ml-auto rounded-tr-sm bg-muted text-foreground/90"
                  : "rounded-tl-sm border border-primary/20 bg-primary/5 text-foreground",
              )}
            >
              {turn.text}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Same persona, same business knowledge — just a different channel.
      </p>
    </div>
  );
}

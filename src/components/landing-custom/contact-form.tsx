"use client";

import { useRef, useState } from "react";
import { ArrowRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formLoadedAt = useRef(Date.now());
  const [honeypot, setHoneypot] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (honeypot || Date.now() - formLoadedAt.current < 2000) {
      setStatus("sent");
      return;
    }
    setStatus("sending");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageSquare className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-semibold">Message sent.</h3>
        <p className="mt-2 text-sm text-muted-foreground">We&apos;ll get back to you shortly.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Your name</label>
        <input
          required
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Jordan Smith"
          className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Email address</label>
        <input
          required
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="jordan@yourcompany.com"
          className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">
          Company <span className="text-muted-foreground/60">(optional)</span>
        </label>
        <input
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
          placeholder="Your company"
          className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Message</label>
        <textarea
          required
          rows={5}
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
          placeholder="What do you want to know or set up?"
          className="w-full resize-none rounded-lg border bg-background px-4 py-2.5 text-sm outline-none ring-primary/40 placeholder:text-muted-foreground focus:ring-2"
        />
      </div>
      {status === "error" && <p className="text-sm text-destructive">{errorMsg}</p>}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", overflow: "hidden", height: 0 }}>
        <input
          type="text"
          name="_confirm"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={status === "sending"} className="w-full gap-2" size="lg">
        {status === "sending" ? "Sending…" : "Send message"}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </form>
  );
}

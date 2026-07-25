import {
  Bot,
  Calendar,
  CalendarClock,
  CheckSquare,
  FileText,
  Globe,
  KanbanSquare,
  Mail,
  Phone,
  Receipt,
  Users,
  Zap,
} from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "Never miss a lead — day or night",
    body:
      "An AI agent answers your website chat, inbound texts, WhatsApp, and phone calls 24/7 — qualifying leads and booking follow-ups the moment intent shows up, even at 2am.",
  },
  {
    icon: Phone,
    title: "Answer every call. Follow up on every lead.",
    body:
      "Inbound calls get picked up and qualified automatically. Turn it around and have the same AI agent proactively dial a filtered list of leads — one click, or a full campaign.",
  },
  {
    icon: Users,
    title: "Build stronger relationships",
    body:
      "A clean list, fast search, profile pages with notes and a unified activity timeline. Import from a CSV in 30 seconds.",
  },
  {
    icon: KanbanSquare,
    title: "See exactly where every deal stands",
    body:
      "Six-stage Kanban board with deal cards, stage timers, and a lost-reason prompt so you learn from what doesn't close.",
  },
  {
    icon: Zap,
    title: "Never lose a lead to a slow response",
    body:
      "Form submits trigger an SMS + email sequence within seconds. Configure once, watch your response time drop to under a minute.",
  },
  {
    icon: Receipt,
    title: "Get paid without the back-and-forth",
    body:
      "Build a line-itemed quote, send it, and the client accepts or pays right from their inbox — PDF, payment link, and a Won deal, all automatic.",
  },
  {
    icon: CalendarClock,
    title: "Fill your calendar on your terms",
    body:
      "Share one link. Visitors pick an open slot, get an ICS-confirmed booking, and reminders send themselves — no back-and-forth.",
  },
  {
    icon: Calendar,
    title: "Know exactly what's next, every day",
    body:
      "Month-grid calendar, due-today badge in the sidebar, contact-linked events. No more juggling tabs to figure out what's next.",
  },
  {
    icon: FileText,
    title: "Turn every visitor into a real lead",
    body:
      "Drag-order field builder, six field types, public hosted page at /f/[id], iframe embed for your site. Submissions auto-create contacts.",
  },
  {
    icon: Globe,
    title: "Launch a site that turns visitors into clients",
    body:
      "Spin up a marketing site or video sales letter funnel for any client in minutes. Live URL in 1–3 minutes after you hit Build.",
  },
  {
    icon: Mail,
    title: "Stay in the conversation, wherever it happens",
    body:
      "One click to send. Replies route straight back to your inbox — no shared mailbox, no copy-paste.",
  },
  {
    icon: CheckSquare,
    title: "See what's working — instantly",
    body:
      "Date-range KPIs, pipeline funnel, won-revenue chart, leads-by-source donut. No spreadsheet exports required.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">
            The Platform
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tighter sm:text-5xl">
            Everything you need.{" "}
            <span className="font-serif font-normal italic">
              Nothing you don&apos;t.
            </span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Built for teams that grow their impact — not for committees that
            shop for software.
          </p>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

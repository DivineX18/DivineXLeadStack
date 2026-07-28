import type { ReactNode } from "react";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import { OrganizationSchema } from "@/components/landing-custom/site-schema";
import { FaqAccordion, type FaqItem } from "@/components/landing-custom/faq-accordion";
import { ChannelDemo } from "@/components/landing-custom/channel-demo";
import { Navbar as CustomNavbar } from "@/components/landing-custom/navbar";
import { CTA as CustomCTA } from "@/components/landing-custom/cta";
import { Footer as CustomFooter } from "@/components/landing-custom/footer";
import {
  Bot,
  Calendar,
  CalendarClock,
  CheckSquare,
  FileText,
  Globe,
  KanbanSquare,
  Mail,
  MessageSquareText,
  Phone,
  PhoneOutgoing,
  Receipt,
  Search,
  ShareIcon,
  Users,
  Webhook,
  Zap,
} from "lucide-react";

export async function generateMetadata() {
  const brand = await resolveCustomBrand();
  return {
    title: `Features — ${brand.name} CRM, Pipeline & AI Agent Tools`,
    description: `Every real, shipped ${brand.name} feature: AI agents across web chat, SMS, WhatsApp and voice, contacts and sales pipeline, quotes and invoicing, lead capture forms, booking pages, and a public API.`,
    openGraph: { title: `Features — ${brand.name}`, type: "website" as const },
  };
}

const FEATURES_FAQS: FaqItem[] = [
  {
    question: "Which channels can the AI agent actually answer?",
    answer:
      "Web chat, SMS, WhatsApp, and inbound phone calls, all from one configured persona — plus outbound voice for proactive calling, behind its own compliance gate.",
  },
  {
    question: "Can I use my own phone number and sending domain?",
    answer:
      "Yes — a dedicated phone number for SMS and calls, and a dedicated email sending domain, are both available so outbound messages carry your brand instead of a shared one.",
  },
  {
    question: "Is the pipeline customizable, or fixed to six stages?",
    answer:
      "Six stages is the shipped default (New through Won/Lost) built around how most sales pipelines actually run — deals, values, and stage timing are all yours to work with inside it.",
  },
  {
    question: "Do forms and booking pages need a developer to set up?",
    answer:
      "No — the form builder is drag-and-drop with six field types, and booking pages are configured through settings, not code. Both are ready to embed or share as a link immediately.",
  },
  {
    question: "Is there really a public API, or just a promise of one?",
    answer:
      "It's live today — REST endpoints for contacts, deals, tasks, events, and form submissions, plus signed outbound webhooks, documented and ready to connect to Zapier, Make, or a custom script.",
  },
];

interface Feature { icon: typeof Bot; title: string; body: string }

const AI_AGENTS: Feature[] = [
  { icon: Bot, title: "One persona, every channel", body: "Write the system prompt, business hours, and escalation rules once. The same agent answers web chat, SMS, WhatsApp, and phone calls — no re-training four different bots." },
  { icon: MessageSquareText, title: "Embeddable web chat", body: "A one-line snippet drops a chat widget on any site. It can capture a name, email, and phone inline mid-conversation and hand off a Task the moment it does." },
  { icon: Phone, title: "AI answers the phone", body: "Inbound calls get picked up, qualified, and — if the caller wants a callback — booked, using the same persona and the same context as every other channel." },
  { icon: PhoneOutgoing, title: "Outbound voice, on your terms", body: "Click-to-call a single contact or launch a filtered campaign. A built-in compliance gate checks opt-out status, calling windows, and contact frequency before anything dials." },
];

const CAPTURE: Feature[] = [
  { icon: FileText, title: "Forms that build themselves", body: "A drag-order field builder, six field types, and a public hosted page or iframe embed. Every submission auto-creates a contact — and a deal, if you want one." },
  { icon: CalendarClock, title: "Booking pages", body: "Share one link. Visitors pick an open slot, get an ICS-confirmed booking by email, and reminders send themselves — reschedules and cancellations included." },
  { icon: ShareIcon, title: "Attribution that survives the click", body: "UTM source, medium, campaign, fbclid, and gclid are captured on every form submission and stored on the contact — so \"where did this lead actually come from\" has a real answer." },
];

const OPERATE: Feature[] = [
  { icon: Users, title: "Contacts built for speed", body: "A fast, searchable list, CSV import in seconds, and a profile page with notes and a unified activity timeline pulling every email, text, call, and form fill into one feed." },
  { icon: KanbanSquare, title: "A pipeline that shows the truth", body: "Six-stage Kanban board, drag-and-drop, days-in-stage on every card, and a lost-reason prompt — so next quarter's forecast is built on more than a guess." },
  { icon: Calendar, title: "One calendar, contact-linked", body: "A month grid, a due-today badge in the sidebar, and every event tied back to the contact it's about." },
  { icon: CheckSquare, title: "Tasks that don't get lost", body: "Today, Overdue, Upcoming, Done — linked to the contact they're about, so follow-up never depends on remembering." },
  { icon: Search, title: "Find anything in one keystroke", body: "Cmd+K searches contacts, deals, tasks, events, and forms from anywhere in the app." },
];

const CLOSE: Feature[] = [
  { icon: Receipt, title: "Quotes clients can accept from their inbox", body: "Build a line-itemed quote with discount, tax, and terms, send it, and the recipient can accept, decline, or pay right from the email — no phone tag." },
  { icon: Zap, title: "Speed-to-lead automation", body: "A form submission can trigger an SMS and email sequence within seconds of arriving, with send-window and opt-out handling built in." },
  { icon: Mail, title: "Email and SMS from the same record", body: "Send from a contact's profile; replies route back to your own inbox, not a shared mailbox everyone has to check." },
];

const REPORT: Feature[] = [
  { icon: Globe, title: "Launch a client site in minutes", body: "Spin up a marketing site or a video-sales-letter funnel from a sectioned form — a live URL in one to three minutes." },
  { icon: Webhook, title: "A public API that isn't an afterthought", body: "REST endpoints for contacts, deals, tasks, events, and form submissions, plus signed outbound webhooks — so a script or a Zapier flow sees exactly what your team sees." },
];

function FeatureGroup({
  eyebrow,
  title,
  body,
  items,
  visual,
}: {
  eyebrow: string;
  title: string;
  body: string;
  items: Feature[];
  /** Optional interactive centerpiece, shown between the intro copy and the card grid — reserved for the one section per page that most benefits from "show, don't tell." */
  visual?: ReactNode;
}) {
  return (
    <section className="py-14 md:py-16">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">{title}</h2>
          <p className="mt-3 text-muted-foreground">{body}</p>
        </div>
        {visual && <div className="mt-10">{visual}</div>}
        <div className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ icon: Icon, title: t, body: b }) => (
            <div key={t} className="group rounded-2xl border bg-card p-6 transition-all hover:-translate-y-0.5 hover:shadow-md">
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="text-base font-semibold">{t}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default async function FeaturesPage() {
  const brand = await resolveCustomBrand();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `https://${brand.primaryDomain}`;
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FEATURES_FAQS.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };

  return (
    <div className="flex min-h-screen flex-col">
      <OrganizationSchema brand={brand} baseUrl={baseUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <CustomNavbar brand={brand} />
      <main className="flex-1">
        <section className="py-20 text-center md:py-24">
          <div className="container mx-auto px-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Features</p>
            <h1 className="mx-auto mt-2 max-w-3xl text-balance text-4xl font-semibold tracking-tighter sm:text-5xl">
              Every feature is something{" "}
              <span className="font-serif font-normal italic">a real team actually uses</span>.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              No roadmap items, no &ldquo;coming soon.&rdquo; Everything below is shipped and working today.
            </p>
          </div>
        </section>

        <FeatureGroup
          eyebrow="AI Agents"
          title="One persona. Every channel."
          body="Configure the agent once — it answers consistently everywhere your leads actually reach out. Switch channels below to see the same conversation happen on each one."
          items={AI_AGENTS}
          visual={<ChannelDemo />}
        />
        <div className="border-t">
          <FeatureGroup
            eyebrow="Capture"
            title="Turn visitors into contacts, automatically"
            body="Forms, booking pages, and attribution tracking that all write into the same record."
            items={CAPTURE}
          />
        </div>
        <div className="border-t">
          <FeatureGroup
            eyebrow="Operate"
            title="The day-to-day, without the sprawl"
            body="Contacts, pipeline, calendar, and tasks — connected, not scattered across tabs."
            items={OPERATE}
          />
        </div>
        <div className="border-t">
          <FeatureGroup
            eyebrow="Close"
            title="From lead to paid, without the back-and-forth"
            body="Quoting, fast first response, and two-way messaging that keeps replies in your own inbox."
            items={CLOSE}
          />
        </div>
        <div className="border-t">
          <FeatureGroup
            eyebrow="Extend"
            title="Sites, and a real way in for other tools"
            body="A client-ready website in minutes, and a public API so you're never locked into working only inside the app."
            items={REPORT}
          />
        </div>

        <section className="border-t py-16 md:py-20">
          <div className="container mx-auto px-4">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">Features FAQ</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tighter sm:text-4xl">
                Questions about specific features
              </h2>
            </div>
            <div className="mx-auto mt-10">
              <FaqAccordion items={FEATURES_FAQS} />
            </div>
          </div>
        </section>

        <CustomCTA brand={brand} />
      </main>
      <CustomFooter brand={brand} />
    </div>
  );
}

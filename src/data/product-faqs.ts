import type { FaqItem } from "@/components/landing-custom/faq-accordion";

/**
 * THE THREE PRODUCTS, ANSWERED IN PUBLIC.
 *
 * Zeno appeared nowhere on any public page before this: every mention lived
 * behind the login. So there was no page that could answer "what is Zeno",
 * "is Flow included with Ascend", or "Ascend vs Flow" for either a search
 * engine or a person deciding which one to buy. These answers exist to be
 * that page, on every main surface rather than buried in one FAQ.
 *
 * DELIBERATELY NO PRICES. The pricing page renders live plan data, and a
 * number hardcoded here would drift out of step with it the first time a
 * plan changes. A wrong price repeated in FAQ structured data is worse than
 * no price at all, because search engines surface it directly. Every answer
 * that touches cost links to /pricing instead.
 *
 * Written from what the products actually are, not from what would rank
 * best: the entitlement keys behind these tiers do not match their names
 * (`ascend_pro` is Zeno, `growth_system` is Ascend), and describing the
 * boundary wrongly in public is how a customer buys the wrong thing.
 */

/** The relationship between the three. Safe on any page. */
export const PRODUCT_FAQS: FaqItem[] = [
  {
    question: "What is the difference between Zeno, Flow, and Ascend?",
    answer:
      "Zeno is the AI assistant: it researches your business and writes the marketing assets, copy, and campaigns you ask it for. Flow is the execution engine: contacts, pipeline, calendar, tasks, forms, quotes, booking pages, funnels, and AI agents that answer across web chat, SMS, WhatsApp, and voice. Ascend is the intelligence layer on top of Flow: it diagnoses what is actually costing you leads, tells you what to fix first, and then lets you carry out the fix in the same place. See pricing for what each one includes.",
  },
  {
    question: "Do I need Flow separately if I have Ascend?",
    answer:
      "No. Ascend includes the Flow operations workspace. One signup, one login, and no second account to set up: the diagnosis and the execution sit in the same product, which is the whole point of buying Ascend rather than the two parts.",
  },
  {
    question: "Which one should I start with?",
    answer:
      "If what you need is marketing copy and assets written for you, start with Zeno. If you already know what to do and need somewhere to run it, start with Flow. If you are not sure what is holding growth back, start with Ascend, because it begins with the diagnosis rather than assuming you already have one.",
  },
  {
    question: "What is a Growth Scan, and is it really free?",
    answer:
      "It analyzes your website and marketing and reports the biggest constraint on conversions, what to fix first, and why. It is free, needs no credit card, and does not require installing anything. It is the fastest way to see what the intelligence layer actually does before paying for anything.",
  },
  {
    question: "Is Zeno included with Flow and Ascend?",
    answer:
      "The AI assistant is part of the product experience in Flow and Ascend. Zeno is also sold on its own for people who want the assistant and the asset generation without the full operations workspace. See pricing for the current boundary between the tiers.",
  },
  {
    question: "Can I move up from one to another later?",
    answer:
      "Yes. Changing plan takes effect on the next billing cycle and your data stays exactly where it is, so moving from Flow up to Ascend is a change of plan rather than a migration.",
  },
];

/**
 * A shorter cut for pages that already carry their own FAQ and only need the
 * product boundary answered once, without pushing their page-specific
 * questions below the fold.
 */
export const PRODUCT_FAQS_SHORT: FaqItem[] = PRODUCT_FAQS.slice(0, 3);

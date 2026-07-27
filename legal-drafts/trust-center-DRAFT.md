> **DRAFT — RC1.7 PRODUCTION-READY VERSION. NOT PUBLISHED. NOT LEGAL ADVICE.**
> This document does not correspond to any live page today (this is a new
> document — a proposed `/trust` landing page). Do not publish or link to
> this file publicly until the documents it links to are approved and
> live.

# Trust Center

**Page copy for a proposed `/trust` route.**

---

## Hero

**Everything about how Flow handles your data, your money, and your
customers' trust — in one place.**

Flow is the Growth Operations Platform in the DivineX ecosystem, alongside
Ascend (Business Intelligence) and Zeno (AI Intelligence). We host your
workspace, your conversations, and your customer data, and we think you
should be able to see exactly how that works before you rely on us.

---

## Document grid

*(Six cards, each linking to its full document)*

### 📄 Terms of Service
The agreement covering your subscription, billing, cancellation, and use
of Flow.
[Read Terms of Service →]

### 🔒 Privacy Policy
What information we collect, how we use it, who we share it with, and how
to exercise your data rights.
[Read Privacy Policy →]

### ✅ Acceptable Use Policy
The rules for using Flow's communication and AI features responsibly —
what's allowed, what isn't, and why.
[Read Acceptable Use Policy →]

### 💳 Refund Policy
How billing, cancellation, and refunds work in plain terms.
[Read Refund Policy →]

### 🛡️ Security
How we protect your data — infrastructure, encryption, access control, and
how to report a security issue.
[Read Security →]

### 🤖 Responsible AI Policy
How Flow's AI features work, their limitations, and the human oversight
built into the product.
[Read Responsible AI Policy →]

---

## Quick answers

*(A short FAQ strip — optional, but matches the pattern of your existing
landing page FAQ. Pull from the documents above rather than restating
independently, so nothing drifts out of sync.)*

**Is Flow hosted, or do I run it myself?**
Flow is fully hosted — we operate the infrastructure, you just use it.

**Can I cancel anytime?**
Yes. Cancel from your billing settings whenever you want; you keep access
through the end of your current paid period.

**Do you sell my data?**
No.

**Where is my data stored?**
On Firebase/Google Cloud infrastructure. See our Security page for detail.

**Do you use my conversations to train AI models?**
It depends on the channel. Text conversations (assistant, web chat, SMS,
WhatsApp) run through OpenRouter, whose default is no storage and no
training use unless an account explicitly opts in — this integration
doesn't opt in. Voice calls run through Vapi, whose default policy allows
call recordings and transcripts to be used to improve their service unless
a privacy-enhanced mode is enabled — this integration doesn't currently
enable that mode. Full detail, including our sources, is in the
Responsible AI Policy.

---

## Footer note

*(Small print at the bottom of the page.)*

Questions about any of these documents? Contact us via chat or at
[supportEmail — hello@divinex.io]. These documents were last reviewed on
[DATE].

---

## Implementation notes (not page copy — for whoever builds this)

- This is content only; no route currently exists for `/trust`. Building it
  is an application-code change and is explicitly out of scope for this
  documentation-only pass — flagged here so it's not lost, not built.
- Once all six documents are approved, each `[Read X →]` link should point
  to that document's real route (`/terms`, `/privacy`, `/acceptable-use`,
  `/refund-policy`, `/security`, `/responsible-ai`) — none of these route
  files exist yet except `/terms` and `/privacy`, which currently serve the
  outdated content this whole effort is replacing.
- The FAQ strip pulls facts from the other five documents; if you edit any
  of them, check this page's FAQ answers still match to avoid two
  documents disagreeing with each other.

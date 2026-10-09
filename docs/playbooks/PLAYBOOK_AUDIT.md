# Playbook Audit

**Written for: Jay and whoever maintains the DivineX playbooks.**

What was compared: the 11 team playbooks in `Skills Needed/` against what
Ascend, Flow and Zeno actually do in code, as extracted in this folder.

Date: 2026-10-08.

---

## Summary

The delivery system and the copy canon agree almost completely. That is the
good news and it is not a small thing: the Copywriting and Ads playbooks and
Flow's 23 conversion frameworks are the same canon expressed twice, in the
same order, with the same guardrails.

Three real gaps, one naming problem, and no drift.

| # | Finding | Severity |
|---|---|---|
| 1 | Ascend and Zeno appear nowhere in the delivery playbooks | **High** |
| 2 | Stage 2 research duplicates by hand what the Growth Scan automates | **High** |
| 3 | The funnel-type library promises 6 types Flow cannot build natively | **Medium** |
| 4 | One concept carries three names across three playbooks | **Medium** |
| 5 | The six pillars are absent from delivery | Medium |
| 6 | No drift between the two playbook homes | None, confirmed |

---

## 1. Ascend and Zeno are invisible to delivery

Mentions across the five largest playbooks:

| Playbook | "Flow" | "Ascend" | "Zeno" |
|---|---|---|---|
| DIVINEX-MASTER | 39 | **0** | **0** |
| FUNNEL-MASTER | 52 | **0** | **0** |
| WEBSITE-BUILD | 56 | **0** | **0** |
| COPYWRITING-MASTER | 6 | **0** | **0** |
| ADS-VSL-MASTER | 4 | **0** | **0** |

Flow is woven through delivery as the CRM and automation destination, which is
right. Ascend and Zeno are not mentioned once.

So the company sells an intelligence product and does not use it to deliver.
Every client engagement starts from a blank page that Ascend could have
pre-filled.

**The fix is a stage, not a sentence.** See the God Mode playbook, Stage 0.

---

## 2. Stage 2 research duplicates the Growth Scan

`DIVINEX-MASTER-PLAYBOOK` Stage 2 runs a 12-step research track. Two of its
steps are manual versions of what Ascend already automates:

| Step | What the team does by hand | What Ascend already produces |
|---|---|---|
| **R1** Current-site audit | Every URL, redirects, DNS, tags, GSC export, GA4, PSI on top 5 | A crawl plus a scored diagnosis across 9 weighted categories |
| **R2** Competitor scan | Structure, claims, look, proof gaps | Market sophistication read and the constraint ranking |

Ascend will not replace R1 entirely. It does not read Search Console or GA4,
and those matter on a migration. But it arrives at the constraint, the
recommendations and the funnel type in minutes, and the team currently starts
from nothing.

The Growth Scan is mentioned twice in the entire corpus, both times in
`FUNNEL-MASTER §11.3`, and only as *"DivineX's own example of a quiz funnel"*.
It is treated as a marketing asset, never as a delivery tool.

---

## 3. The funnel-type library outruns what Flow can build

`FUNNEL-MASTER §11.15` lists **14 funnel types**. Flow has **8 genres**.

| Playbook funnel type | Flow genre | Buildable today? |
|---|---|---|
| Lead magnet | `lead_magnet` | Yes |
| Tripwire / SLO | `tripwire` + `checkout` section | Yes |
| Quiz / assessment / scan | `lead_gen` + `multi_step_form` | **Yes, but not as a genre** |
| Webinar | `webinar` (+ `eventStartAt`) | Yes |
| VSL | `vsl` | Yes |
| Challenge | `challenge` | Yes |
| Application | `application` | Yes |
| Free consultation | `booking` | Yes |
| Local service | `booking` or `lead_gen` | Yes |
| Ecommerce / free-plus-shipping | `checkout` + `upsell_offer` sections | Partial, no genre |
| Membership / continuity | Community product, not a funnel genre | **Different system** |
| Product launch (PLF) | none | **No** |
| Donation | none | **No** |
| Event registration | `webinar` is the nearest fit | **Borrowed semantics** |

The quiz row matters most because it is the one the team sells. An assessment
funnel is built as `lead_gen` with a stepped `multi_step_form`, which works and
is already proven, but a delivery operator reading the playbook would look for
a quiz genre and not find one.

**Why borrowed semantics is a real risk, not a tidiness complaint.** Flow added
its `booking` genre precisely because a physiotherapy page offering a free
assessment had been classified `lead_magnet`. The publish contract then
demanded an uploaded file the page never promised, and the page could not go
live at all. When intent has no way to be represented, it borrows the semantics
of something it is not, and the failure shows up at publish time.

Donation and product-launch funnels would hit the same wall today.

---

## 4. One concept, three names

| Playbook | Name |
|---|---|
| COPYWRITING-MASTER | The One Belief / Big Domino |
| ADS-VSL-MASTER | The One Argument |
| Flow framework library | `one-argument`, "The One Argument" |

Same idea: the single belief that makes the action obvious. Three labels across
three documents an operator is told to read in sequence.

`DIVINEX-MASTER §2.1 R5` uses "One Belief" and cites both `Copy §4-§7` and
`Ads §4`, so the seam is already visible in the orchestration layer.

**Recommended:** One Argument as the canonical term, since that is what the
software calls it and what the winning-ads corpus calls it, with One Belief
kept as the stated synonym in Copy.

---

## 5. The six pillars are absent from delivery

Ascend's master diagnostic model, **Clarity, Positioning, Offer, Traffic,
Conversion, Ascension**, appears in zero team playbooks.

The delivery playbooks organise around a production sequence (kickoff,
strategy, homepage, production, launch). That is the right spine for building a
site. It is not a diagnostic, and it gives the team no shared language for
*why* this client needs this work.

---

## 6. What is already right

Worth stating plainly, because most of this corpus is in good shape.

**No drift.** All 8 shared playbooks are byte-identical between
`DivineX-web/docs/playbooks/` and `Skills Needed/`. SEO and Kickoff live only
on the desktop, exactly as `DIVINEX-MASTER §0.1` says.

**The copy canon agrees with the software.** Awareness levels, market
sophistication, the unique mechanism, old way versus new way, slippery-slide
cadence, hook types, proof specificity, single-action CTA: all present in both
the playbooks and Flow's framework library, with the same meaning.

**The honesty rules agree.** The playbooks' hard rule 3 ("nothing invented") is
the same rule Flow enforces in code through claim integrity, evidence proof and
the visual-requirements system. The team wrote it down and the software
enforces it. That is the correct relationship.

**One page, one job, one primary action** is hard rule 7 in the master playbook
and the `single-cta-clarity` framework in Flow.

**Precedence is already solved.** `DIVINEX-MASTER §0.4` has a seven-level
precedence order for when documents disagree. Most playbook suites never get
this far.

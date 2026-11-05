# AI Suite capability retry safety — 2026-11-05

Companion to `src/lib/ai-suite/confirm-idempotency.ts`. That module closes
the concurrent/sequential duplicate-confirm problem at the route level, but
names one accepted residual risk in its own doc comments: if a capability's
`execute()` performs a real external side effect that succeeds right as the
process crashes before the route can settle the result, a retry past the
stale-lock window (`RUNNING_STALE_MS`, 2 minutes) re-runs `execute()` from
scratch. For a capability whose underlying write is naturally idempotent on
retry, that's harmless. For one that creates a new resource via an
auto-generated id, or fires a real third-party call with no provider-side
idempotency key, a retry in that narrow window can double it.

This is that classification, so it's a documented fact about the registry
rather than an assumption baked into the idempotency guard's design.

Scope: the 38 non-readonly base capabilities in `capabilities.ts`. The ~26
`_in_sub_account` wrapper-generated variants are not listed separately —
the wrapper only re-anchors tenancy (`subAccountId` to the caller's own
`agencyId`), it adds no idempotency of its own, so each one carries its
base's verdict unchanged.

## Agency level

| Capability | Verdict | Reason |
|---|---|---|
| `set_feature_gate` | SAFE | Deterministic-target `.doc(subAccountId).update(...)` — pure overwrite. |
| `create_sub_account` | UNSAFE | `createSubAccountForAgency` uses an auto-id `.doc()` for the sub-account itself (the transaction only guards the counter). A retry creates a second whole workspace. |

## Sub-account level

| Capability | Verdict | Reason |
|---|---|---|
| `create_contact` | **UNSAFE** | Auto-id, no dedup by email/phone, and unconditionally fires `contact.created` + workflow triggers — can double-fire a real downstream SMS/email send. |
| `create_deal` | UNSAFE | Auto-id, no natural-key dedup. |
| `move_deal_stage` / `update_deal` | SAFE | Existing-`dealId` patch. |
| `create_webhook` | **UNSAFE** | Auto-id subscription **plus** a synchronous real test-delivery HTTP POST to the customer's own automation endpoint. Retry = second subscription + a second real delivery. |
| `update_webhook` | SAFE | Existing-id patch. |
| `create_community` | UNSAFE | Group/course/section/lesson all created via auto-id `.add()`. Retry duplicates the whole structure. |
| `update_community` | SAFE | Existing-id patch. |
| `create_workflow` | UNSAFE | Auto-id. Lower real-world severity — created as a draft, sends nothing until separately enabled. |
| `apply_workflow_plan` | **UNSAFE (unverified dedup)** | Patches an existing workflow doc, but no confirmed guard against the same plan being applied twice — flagged for closer review rather than asserted with full confidence. |
| `edit_workflow_logic` / `edit_workflow_steps` / `revise_workflow_email` | SAFE | Existing-`workflowId` patch. |
| `create_task` | UNSAFE | Auto-id. |
| `update_task` / `complete_task` | SAFE | Existing-`taskId` patch. |
| `create_event` | UNSAFE | Auto-id, plus an auto-id contact-activity write. |
| `update_event` | SAFE | Existing-`eventId` patch. |
| `invite_member` | **UNSAFE-BUT-MITIGATED (partially)** | The invite row itself IS deduped by `(email, subAccountId, not-yet-accepted)` — DB-safe. The invite email send is NOT conditioned on that reuse — it resends every call. Correspondence-unsafe. |
| `update_member_role` | SAFE | Existing-member patch. |
| `scan_business_website` | UNSAFE | Real cross-service scrape + AI brand-fact extraction via the Ascend bridge, no visible idempotency key; persists candidate photos, so a retry risks duplicate assets plus a second real scrape. |
| `create_website` | UNSAFE | Auto-id, consumes a capped site slot, and submits a real build to gitpage.site (rate-limited 30/hr/agency) with no idempotency key. |
| `rebuild_website` | UNSAFE | Same real external build call as above, on retry. |
| `update_website` | SAFE | Existing-site patch. |
| `create_funnel` | UNSAFE | Auto-id. |
| `link_funnel_steps` / `edit_funnel_structure` / `revise_funnel_copy` | SAFE | Existing-`funnelId` patch. |
| `create_asset` | **UNSAFE (real cost)** | Starts a real, ~100–172s paid AI image/video generation job via the Ascend bridge, no idempotency key. Retry = a second real paid run. |
| `create_email` | UNSAFE | Auto-id (creates a draft template; doesn't send by itself). |
| `revise_email` / `edit_email_cta` | SAFE | Existing-template patch. |
| `create_form` | UNSAFE | Auto-id. |
| `update_form` | SAFE | Existing-`formId` patch. |
| `create_booking_page` | SAFE | Deterministic id (the slug itself), not auto-generated — a retry with the same slug overwrites/collides, it doesn't duplicate. |
| `update_booking_page` | SAFE | Existing-page patch. |

Readonly capabilities (`research_website_reference`, `get_website_prefill`,
`check_website_status`, `list_media_assets`, `inspect_asset`,
`trace_connected_system`, every `list_*`/`check_funnel_status`/`my_access`/
`open_workspace`/`workspace_stats`/`find_*`) are excluded — they can't be
confirmed through this route at all.

## Summary

- **38 write capabilities** classified.
- **SAFE: 21** — `set_feature_gate`, `move_deal_stage`, `update_deal`,
  `update_webhook`, `update_community`, `edit_workflow_logic`,
  `edit_workflow_steps`, `revise_workflow_email`, `update_task`,
  `complete_task`, `update_event`, `update_member_role`, `update_website`,
  `link_funnel_steps`, `edit_funnel_structure`, `revise_funnel_copy`,
  `revise_email`, `edit_email_cta`, `update_form`, `create_booking_page`,
  `update_booking_page`.
- **UNSAFE: 16** — `create_sub_account`, `create_contact`, `create_deal`,
  `create_webhook`, `create_community`, `create_workflow`,
  `apply_workflow_plan`, `create_task`, `create_event`,
  `scan_business_website`, `create_website`, `rebuild_website`,
  `create_funnel`, `create_asset`, `create_email`, `create_form`.
- **UNSAFE-BUT-MITIGATED (partial): 1** — `invite_member`.

### Highest-risk, read this part first

Ranked by real-world cost of a double-fire (money or real correspondence,
not just a duplicate row):

1. **`create_contact`** — duplicate contact *and* can double-fire a real
   downstream SMS/email via workflow automation.
2. **`create_webhook`** — double-fires a real HTTP delivery into the
   customer's own n8n/Make/Zapier automation.
3. **`create_asset`** — a second real, ~100–172s paid AI generation job.
4. **`create_website`** / **`rebuild_website`** — a second real
   gitpage.site build against a rate-limited, cost-bearing API, and burns a
   capped site slot.
5. **`scan_business_website`** — a second real scrape + AI brand
   extraction, duplicate persisted candidate assets.
6. **`invite_member`** — resends a real invite email on every retry
   regardless of the (correctly deduped) DB row.
7. **`apply_workflow_plan`** — unverified dedup; a retry may duplicate
   steps in a workflow that, once live, sends real messages twice per
   contact.

### What this does and doesn't mean for the idempotency guard

This table does not change `confirm-idempotency.ts`'s design. The
`RUNNING_STALE_MS` window already exists specifically to make the
crash-then-retry case rare, and making every one of these 16 capabilities
individually resumable against partial failure would be a new,
per-capability orchestration layer — explicitly out of scope for the
guard's own stated goal ("smallest compatible change ... do not introduce
a new orchestration system"). What this table changes is that the risk is
now named per-capability instead of asserted in the abstract: the 16
UNSAFE rows above are the ones where a crash inside the stale window has a
real, specific consequence, and `apply_workflow_plan` and `invite_member`
are flagged for someone to look at more closely before relying on this
guard alone to make them safe.

Not verified in this pass: whether any of the downstream `*ServerSide`
helpers or the Ascend-bridge calls (`ascend.startAssetGeneration`,
`ascend.discover`, gitpage's `submitBuild`) accept or honor a
client-supplied idempotency key at their own layer. The classification
above is based on what this route's `execute()` call passes today, which
in every UNSAFE row is nothing — a future pass could close several of
these by threading a deterministic key (e.g. derived from
`confirmationId`) into those downstream calls instead of relying on the
route-level guard alone.

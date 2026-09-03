import "server-only";

import { NextResponse } from "next/server";
import {
  requireAgencyOwnerAny,
  requireSubAccountMember,
} from "@/lib/auth/require-tenancy";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  aiSuiteIsConfigured,
  runAiSuiteTurn,
  type AiSuiteLlmMessage,
} from "@/lib/ai-suite/model";
import { recordAiSuiteUsage } from "@/lib/ai-suite/usage";
import { retrieveKnowledge } from "@/lib/ai-suite/retrieve";
import { buildAiSuiteSystemPrompt } from "@/lib/ai-suite/prompt";
import {
  listActivePrinciplesForArchetype,
  renderPrinciplesAsCards,
} from "@/lib/design-intelligence/principles";
import {
  CONVERSION_FRAMEWORKS,
  renderFrameworksAsCards,
} from "@/lib/conversion/framework-library";
import {
  CapabilityUserError,
  capabilityNamesForLevel,
  getCapability,
  roleSatisfies,
  toolsForLevel,
  type AiSuiteActionContext,
} from "@/lib/ai-suite/capabilities";
import { CUSTOM_BRAND } from "@/config/landing";
import type {
  AiSuiteChatMessage,
  AiSuiteChatRequest,
  AiSuiteChatResponse,
  AiSuiteLevel,
} from "@/types/ai-suite";

export const dynamic = "force-dynamic";

const MAX_HISTORY_TURNS = 12;
const MAX_MESSAGE_CHARS = 4000;
/** Max read-only lookups the model may chain in one user turn. */
const MAX_LOOKUP_HOPS = 3;
/**
 * How many times the model may repair a WRITE capability's arguments before
 * we give up. Every capability's validate() error is written as an
 * instruction to the model ("write a headline yourself and call it again"),
 * so it has to reach the model to do anything. Two attempts is enough for a
 * missing-field repair without letting a confused turn spin.
 */
const MAX_WRITE_REPAIR_HOPS = 2;

function sanitizeMessages(input: unknown): AiSuiteChatMessage[] | null {
  if (!Array.isArray(input)) return null;
  const cleaned: AiSuiteChatMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    cleaned.push({ role, content: trimmed.slice(0, MAX_MESSAGE_CHARS) });
  }
  return cleaned.slice(-MAX_HISTORY_TURNS);
}

type RoleCtx = { agencyRoleIsOwner: boolean; subAccountRole?: string };

export async function POST(request: Request) {
  let body: AiSuiteChatRequest;
  try {
    body = (await request.json()) as AiSuiteChatRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const level = body.level;
  if (level !== "agency" && level !== "sub-account") {
    return NextResponse.json(
      { error: "`level` must be 'agency' or 'sub-account'." },
      { status: 400 },
    );
  }

  // ── Auth + (for sub-accounts) the agency gate. The route decides who can
  // act here — never the model.
  let roleCtx: RoleCtx;
  let actionCtx: AiSuiteActionContext;
  let usageAgencyId = "";
  let workspaceName = "";
  if (level === "sub-account") {
    if (!body.subAccountId || typeof body.subAccountId !== "string") {
      return NextResponse.json(
        { error: "`subAccountId` is required for sub-account level." },
        { status: 400 },
      );
    }
    const access = await requireSubAccountMember(request, body.subAccountId);
    if (access instanceof NextResponse) return access;

    const subSnap = await getAdminDb()
      .doc(`subAccounts/${body.subAccountId}`)
      .get();
    // Opt-in gate: Zeno (sub-account level) is OFF unless the agency owner
    // explicitly enabled it for this sub-account (legacy/unset reads as off).
    if (subSnap.data()?.aiSuiteEnabledByAgency !== true) {
      return NextResponse.json(
        {
          error:
            "The AI Suite is disabled for this sub-account. Ask your agency owner to enable it.",
        },
        { status: 403 },
      );
    }
    workspaceName =
      typeof subSnap.data()?.name === "string" ? subSnap.data()!.name : "";
    roleCtx = {
      agencyRoleIsOwner: access.subAccountRole === "agencyOwner",
      subAccountRole: access.subAccountRole,
    };
    actionCtx = {
      uid: access.uid,
      email: access.email,
      displayName: "",
      agencyId: access.agencyId ?? "",
      subAccountId: body.subAccountId,
      subAccountRole: access.subAccountRole,
    };
    usageAgencyId = access.agencyId ?? "";
  } else {
    const owner = await requireAgencyOwnerAny(request);
    if (owner instanceof NextResponse) return owner;
    // Master switch: Zeno (agency level) is OFF unless the owner enabled it
    // under Agency → Settings (legacy/unset reads as off).
    const agencySnap = await getAdminDb()
      .doc(`agencies/${owner.agencyId}`)
      .get();
    if (agencySnap.data()?.agencyAssistantEnabled !== true) {
      return NextResponse.json(
        {
          error:
            "Zeno is turned off. Enable it under Agency → Settings.",
        },
        { status: 403 },
      );
    }
    roleCtx = { agencyRoleIsOwner: true };
    actionCtx = {
      uid: owner.uid,
      email: owner.email,
      displayName: "",
      agencyId: owner.agencyId ?? "",
    };
    usageAgencyId = owner.agencyId ?? "";
  }

  if (!aiSuiteIsConfigured()) {
    return NextResponse.json(
      {
        error:
          "The AI Assistant isn't set up on this deployment yet — contact your workspace admin.",
      },
      { status: 503 },
    );
  }

  const messages = sanitizeMessages(body.messages);
  if (!messages || messages.length === 0) {
    return NextResponse.json(
      { error: "At least one message is required." },
      { status: 400 },
    );
  }
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json(
      { error: "The latest turn must include a user message." },
      { status: 400 },
    );
  }

  const lvl = level as AiSuiteLevel;
  const tools = toolsForLevel(lvl, roleCtx);
  const { actions: actionNames, lookups: lookupNames } =
    capabilityNamesForLevel(lvl, roleCtx);

  // Retrieve over the recent turns, not just the last message, so a
  // follow-up like "how do I turn that on?" still pulls the cards for the
  // feature named earlier. The latest question is included twice so it
  // dominates the keyword scoring.
  const recentUsers = messages.filter((m) => m.role === "user").slice(-2);
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");
  const retrievalQuery = [
    ...recentUsers.map((m) => m.content),
    lastAssistant?.content ?? "",
    lastUser.content,
  ]
    .filter(Boolean)
    .join("\n");
  const cards = retrieveKnowledge(retrievalQuery, lvl);

  // Calibration Engine v1 — inject the Design Knowledge Vault's learned
  // principles as additional REFERENCE MATERIAL cards, exactly like the
  // static knowledge base above, whenever this turn can call create_funnel.
  // This is the actual "gets better every week" mechanism: every principle
  // extracted from operator feedback (see lib/design-intelligence) makes
  // every future funnel generation smarter platform-wide, with zero
  // changes needed to buildAiSuiteSystemPrompt's own rendering — it already
  // knows how to render an AiSuiteKnowledgeCard[]. Best-effort: a vault
  // read failure must never block the chat turn itself.
  if (actionNames.some((a) => a.name === "create_funnel")) {
    try {
      const principles = await listActivePrinciplesForArchetype(null);
      cards.push(...renderPrinciplesAsCards(principles));
    } catch {
      // Swallowed — Zeno still generates funnels fine with zero learned
      // principles, same as before this feature existed.
    }
    // Conversion Engine (P1) — inject the DivineX Conversion Framework Library
    // as REFERENCE MATERIAL so Zeno REASONS from distilled principles when it
    // builds a funnel: awareness/sophistication routing, page-architecture-by-
    // intent, offer value-stacking, honest proof/guarantee/urgency, and
    // message-matched email sequences — principles applied to THIS business,
    // never a fixed template. The full library is injected (not a per-strategy
    // subset) because the model reasons with it BEFORE it picks a genre; the
    // per-strategy selection is used later by the Build-Campaign orchestrator.
    // Static canon (no DB read), so no try/catch is needed here. Rendered via
    // the same AiSuiteKnowledgeCard mechanism the prompt builder already knows,
    // so buildAiSuiteSystemPrompt needs zero changes.
    cards.push(...renderFrameworksAsCards(CONVERSION_FRAMEWORKS));
    // Ascend Intelligence Library (synced frameworks — see
    // lib/conversion/ascend-frameworks.ts). Best-effort: zero synced docs or
    // a read failure leaves the context exactly as before the bridge existed.
    // DIVINEX SLICE 7 — shared Zeno context: the canonical Business/Brand
    // profile reaches Flow's Zeno the same way frameworks do, so one
    // strategist knows the business across both products. Best-effort;
    // no snapshot = today's context exactly.
    try {
      const { getDivinexProfileSnapshot } = await import("@/lib/divinex/contract");
      const snap = await getDivinexProfileSnapshot(actionCtx.subAccountId!);
      if (snap) {
        const business = snap.business as Record<string, unknown>;
        const brand = (snap.brand ?? {}) as { visual?: Record<string, unknown>; voice?: Record<string, unknown> };
        const approved = (snap.assets ?? []).filter((a) => (a.status ?? "approved") === "approved");
        const lines = [
          `Business: ${business.name ?? "(unnamed)"}${business.type ? ` — ${business.type}` : ""}`,
          business.websiteUrl ? `Website: ${business.websiteUrl}` : "",
          business.audience ? `Audience: ${business.audience}` : "",
          business.offer ? `Primary offer: ${business.offer}` : "",
          snap.offers?.length ? `Known offers (reference by id): ${snap.offers.map((o) => `${o.id} = "${o.name}"`).join("; ")}` : "",
          brand.voice ? `Brand voice: ${JSON.stringify(brand.voice).slice(0, 400)}` : "",
          brand.visual ? `Brand visual: ${JSON.stringify(brand.visual).slice(0, 400)}` : "",
          approved.length
            ? `Approved brand assets (${approved.length}): ${approved.slice(0, 12).map((a) => `#${a.id} ${a.classification ?? "asset"}`).join(", ")}`
            : "No approved brand assets yet — ask for the ones that would most strengthen the page rather than using stand-ins.",
          "",
        ];
        // ASCEND'S DIAGNOSIS. Rendered as reasoning material, not as fields to
        // recite: Zeno should conclude "your constraint is conversion, so
        // build X", never read a score aloud. Absent intelligence stays
        // absent — an undiagnosed business must not be told it was diagnosed.
        const intel = (snap as { intelligence?: {
          primaryConstraint?: string;
          opportunities?: { title: string; why?: string }[];
          recommendedFunnelType?: string; recommendedLeadMagnet?: string;
          scoreLabel?: string; assessedAt?: string;
        } }).intelligence;
        if (intel && (intel.primaryConstraint || intel.opportunities?.length)) {
          lines.push(
            "",
            "WHAT ASCEND HAS DIAGNOSED ABOUT THIS BUSINESS:",
            intel.primaryConstraint ? `Biggest thing holding growth back: ${intel.primaryConstraint}` : "",
            intel.opportunities?.length
              ? `Best opportunities, strongest first: ${intel.opportunities.slice(0, 3).map((o) => o.title + (o.why ? ` (${o.why})` : "")).join("; ")}`
              : "",
            intel.recommendedFunnelType ? `Campaign shape that fits: ${intel.recommendedFunnelType}` : "",
            intel.recommendedLeadMagnet ? `Lead magnet that fits: ${intel.recommendedLeadMagnet}` : "",
            intel.scoreLabel ? `Overall growth stage: ${intel.scoreLabel}` : "",
            "",
            "REASON FROM THIS. When they ask what to do, or ask you to build something, let the constraint and the opportunities shape WHAT you recommend and WHAT you build — not just how you describe it. Do not quote scores, field names or this list back at them; speak as someone who already understands their business. Never claim a diagnosis you were not given.",
          );
        }
        lines.push(
          "USE THIS: never ask the customer for anything above — you already know it. Reference offers and assets by their ids. This is DURABLE business truth; campaign-specific intent (what to promote right now, to whom, with what follow-up) is gathered per campaign and never written back here.",
        );
        const body = lines.filter(Boolean).join("\n");
        cards.push({
          id: "divinex-business-profile",
          levels: ["sub-account"],
          title: "This workspace's business + brand (canonical)",
          location: "DivineX Business Profile",
          keywords: ["business", "brand", "profile", "assets", "offers"],
          body,
        });
      }
    } catch {
      // Swallowed — Zeno works without the profile, same as before.
    }
    try {
      const { listAscendFrameworks, renderAscendFrameworksAsCards } = await import("@/lib/conversion/ascend-frameworks");
      cards.push(...renderAscendFrameworksAsCards(await listAscendFrameworks()));
    } catch {
      // Swallowed — same rationale as the learned-principles read above.
    }

    // P0.6 PHASE 2 — page + artifact context.
    //
    // The route is normalized to one of the final IA surfaces (an arbitrary
    // string can never reach the prompt), and the artifact is resolved from
    // authoritative storage against THIS authenticated workspace. A foreign
    // or nonexistent reference both resolve to null, so nothing here can
    // become a tenant-enumeration path.
    try {
      const { normalizeSurface, resolveArtifact, renderPageContextCard } =
        await import("@/lib/ai-suite/page-context");
      const pc = body.pageContext;
      const surface = normalizeSurface(pc?.route);
      const artifact = pc?.artifactRef
        ? await resolveArtifact(actionCtx.subAccountId!, pc.artifactRef)
        : null;
      const card = renderPageContextCard(surface, artifact);
      if (card) cards.push(card);
    } catch {
      // Swallowed — Zeno works without page context, exactly as before.
    }
  }

  const systemPrompt = buildAiSuiteSystemPrompt({
    level: lvl,
    brandName: CUSTOM_BRAND.name || "your CRM",
    cards,
    actionNames,
    lookupNames,
    todayIso: new Date().toISOString().slice(0, 10),
    caller: {
      email: actionCtx.email,
      isAgencyOwner: roleCtx.agencyRoleIsOwner,
      ...(lvl === "sub-account"
        ? { workspaceName, workspaceRole: actionCtx.subAccountRole }
        : {}),
    },
  });

  const llmMessages: AiSuiteLlmMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  // Run the turn, executing read-only lookups inline (their results go back
  // to the model as tool messages) until the model produces either text or a
  // confirm-gated write proposal. Writes are NEVER executed here.
  let turn;
  let writeRepairs = 0;
  try {
    for (let hop = 0; ; hop++) {
      turn = await runAiSuiteTurn({ messages: llmMessages, tools });
      const call = turn.toolCall;
      if (!call || hop >= MAX_LOOKUP_HOPS) break;
      const cap = getCapability(call.name);

      // A WRITE the model got wrong: hand the validation error back to it so
      // it can fix the arguments, the same way a lookup result goes back.
      // Without this the turn dead-ends and the customer is shown the raw
      // instruction text ("YOU are the copywriter…") — internal prompt
      // engineering surfacing as a question, and the build never happens.
      if (
        cap &&
        !cap.readonly &&
        cap.level === lvl &&
        roleSatisfies(cap.requiredRole, roleCtx) &&
        writeRepairs < MAX_WRITE_REPAIR_HOPS
      ) {
        const attempt = cap.validate(call.args);
        if (attempt.ok) break; // good args — fall through to the proposal path
        writeRepairs++;
        console.warn(`[ai-suite/chat] ${cap.name} args rejected (repair ${writeRepairs}): ${attempt.error}`);
        llmMessages.push(
          {
            role: "assistant",
            content: turn.text,
            tool_calls: [
              {
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          },
          { role: "tool", tool_call_id: call.id, content: `Invalid arguments: ${attempt.error}` },
        );
        continue;
      }

      if (
        !cap ||
        !cap.readonly ||
        cap.level !== lvl ||
        !roleSatisfies(cap.requiredRole, roleCtx)
      ) {
        break; // not a lookup — fall through to the proposal path below
      }
      const validated = cap.validate(call.args);
      let lookupResult: string;
      if (!validated.ok) {
        lookupResult = `Invalid arguments: ${validated.error}.`;
      } else {
        try {
          const execResult = await cap.execute(actionCtx, validated.args);
          // A lookup that resolved a navigation target short-circuits: show
          // the user the message + button directly (no final model turn).
          if (execResult.navigate) {
            void recordAiSuiteUsage({
              level: lvl,
              agencyId: usageAgencyId,
              subAccountId:
                level === "sub-account" ? body.subAccountId : undefined,
              kind: "message",
            });
            const response: AiSuiteChatResponse = {
              type: "navigate",
              text: execResult.resultText,
              href: execResult.navigate.href,
              label: execResult.navigate.label,
            };
            return NextResponse.json(response);
          }
          lookupResult = execResult.resultText;
        } catch (err) {
          console.error(
            `[ai-suite/chat] lookup ${cap.name} failed:`,
            err instanceof Error ? err.message : err,
          );
          lookupResult =
            err instanceof CapabilityUserError
              ? `The lookup couldn't run: ${err.message}`
              : "The lookup failed. Answer without it, and say the data couldn't be checked.";
        }
      }
      llmMessages.push(
        {
          role: "assistant",
          content: turn.text,
          tool_calls: [
            {
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.args) },
            },
          ],
        },
        { role: "tool", tool_call_id: call.id, content: lookupResult },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[ai-suite/chat] model call failed:", msg);
    return NextResponse.json(
      { error: "The assistant couldn't reach the model. Please try again." },
      { status: 502 },
    );
  }

  // Count this turn toward daily usage (best-effort; never blocks the reply).
  void recordAiSuiteUsage({
    level: lvl,
    agencyId: usageAgencyId,
    subAccountId: level === "sub-account" ? body.subAccountId : undefined,
    kind: "message",
  });

  // Did the model request a write action? Validate it and surface a
  // proposal — nothing executes here. (A readonly call landing here means
  // the lookup hop cap was hit — treat it as text, never as a proposal.)
  if (turn.toolCall) {
    const cap = getCapability(turn.toolCall.name);
    if (cap && !cap.readonly && cap.level === lvl) {
      const validated = cap.validate(turn.toolCall.args);
      if (validated.ok) {
        const response: AiSuiteChatResponse = {
          type: "proposal",
          proposal: {
            id: turn.toolCall.id,
            capability: cap.name,
            args: validated.args,
            summary: cap.summarize(validated.args),
          },
        };
        return NextResponse.json(response);
      }
      // Still wrong after its repair attempts. validate() errors are written
      // for the model, not the customer — surfacing one verbatim shows people
      // internal instructions. Log the real reason, say something true and
      // useful instead.
      console.warn(`[ai-suite/chat] ${cap.name} args still invalid after ${writeRepairs} repair(s): ${validated.error}`);
      const response: AiSuiteChatResponse = {
        type: "message",
        text:
          "I couldn't put that together yet. Tell me a bit more about the offer and who it's for, and I'll build you a draft.",
      };
      return NextResponse.json(response);
    }
  }

  const response: AiSuiteChatResponse = {
    type: "message",
    text:
      turn.text ||
      "I'm not sure how to help with that — could you rephrase, or ask how a feature works?",
  };
  return NextResponse.json(response);
}

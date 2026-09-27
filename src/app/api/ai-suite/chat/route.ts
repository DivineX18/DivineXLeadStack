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
import { isZenoError, runZenoTurn } from "@/lib/ai-suite/orchestrator";
import {
  listActivePrinciplesForArchetype,
  renderPrinciplesAsCards,
} from "@/lib/design-intelligence/principles";
import {
  CONVERSION_FRAMEWORKS,
  renderFrameworksAsCards,
} from "@/lib/conversion/framework-library";
import { assertNoMutationOnLookup } from "@/lib/ai-suite/execution-result";
import {
  CapabilityUserError,
  capabilityNamesForLevel,
  getCapability,
  roleSatisfies,
  toolsForLevel,
  type AiSuiteActionContext,
} from "@/lib/ai-suite/capabilities";
import { operatorFigureStatements } from "@/lib/funnels/claim-integrity";
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

/**
 * ONLY A GENUINE MODEL-REACH FAILURE IS A 5xx.
 *
 * The turn loop below does three things inside one try: it calls the model,
 * it validates capability arguments, and it executes lookups. Every one of
 * them used to land on the same catch, which returned 502 "couldn't reach
 * the model". So a capability whose validate() threw was reported to the
 * customer as an outage, and to us as a model problem, pointing every
 * investigation at the wrong system.
 *
 * Tagging the model call means the catch can tell the two apart: the model
 * being unreachable is infrastructure and keeps its 502, and anything else
 * is our bug, which is logged loudly and answered conversationally instead
 * of destroying the conversation.
 */
class ModelUnreachableError extends Error {
  constructor(readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "ModelUnreachableError";
  }
}

/**
 * validate() is pure argument checking and must not throw. When one does, it
 * is a programming error in that capability, not a failure of the turn: the
 * model gets told the arguments were rejected and carries on, exactly as it
 * would for an ordinary rejection.
 */
function safeValidate(
  cap: { name: string; validate: (a: Record<string, unknown>) => { ok: true; args: Record<string, unknown> } | { ok: false; error: string } },
  args: Record<string, unknown>,
): { ok: true; args: Record<string, unknown> } | { ok: false; error: string } {
  try {
    return cap.validate(args);
  } catch (err) {
    console.error(
      `[ai-suite/chat] ${cap.name}.validate threw, which it must never do:`,
      err instanceof Error ? err.stack ?? err.message : err,
    );
    return { ok: false, error: "those arguments couldn't be read" };
  }
}

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
  // act here, never the model.
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

  /**
   * The assistant itself lives in lib/ai-suite/orchestrator. This route's
   * job ends once it has proven who is asking: everything below that line
   * is the same code Telegram runs, so the two channels cannot drift into
   * different behaviour.
   */
  const result = await runZenoTurn({
    actor: actionCtx,
    level: level as AiSuiteLevel,
    roleCtx,
    workspaceName,
    usageAgencyId,
    messages: body.messages ?? [],
    channel: "web",
    ...(body.pageContext ? { pageContext: body.pageContext } : {}),
  });
  if (isZenoError(result)) {
    return NextResponse.json({ error: result.__error }, { status: result.status });
  }
  return NextResponse.json(result);
}

/**
 * ZENO LIVE E2E — the conversational chain, not the services underneath.
 *
 * A capability can be correct and still be unreachable: the model may not
 * pick it, may not resolve the object first, or may send arguments its
 * validate rejects. Calling the service directly proves none of that, so
 * this drives the real path the customer does — real model, real tool
 * choice, real lookup hops, real validate, real execute, real Firestore —
 * and reports before/after state around every mutation.
 *
 * It mirrors the two routes rather than importing them, because those are
 * HTTP handlers behind session auth. The parts that decide behaviour (the
 * system prompt, the tool list, the hop loop, validate, execute) are the
 * same functions the routes call. Auth and transport are NOT covered here.
 *
 * Usage: ZENO_E2E=<case> npx tsx --tsconfig ./scripts/tsconfig.verify.json scripts/zeno-live-e2e.mts
 */
import { readFileSync } from "node:fs";
for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const i = l.indexOf("="); if (i > 0 && !l.startsWith("#")) process.env[l.slice(0,i).trim()] ??= l.slice(i+1).trim().replace(/^["']|["']$/g,"");
}

const { AI_SUITE_CAPABILITIES, toolsForLevel, capabilityNamesForLevel, CapabilityUserError } =
  await import("../src/lib/ai-suite/capabilities");
const { runAiSuiteTurn } = await import("../src/lib/ai-suite/model");
const { buildAiSuiteSystemPrompt } = await import("../src/lib/ai-suite/prompt");
const { getAdminDb } = await import("../src/lib/firebase/admin");

export const SA = process.env.ZENO_SA ?? "MEYB8CbWlE5fxAn3TJOp";
export const db = getAdminDb();

const saDoc = await db.doc(`subAccounts/${SA}`).get();
if (!saDoc.exists) { console.error(`workspace ${SA} not found`); process.exit(1); }
const AGENCY = String(saDoc.data()?.agencyId ?? "");
const HOST_UID = "irkY5HKIzxb64l5qCyHroTrudJa2";

const ctx = {
  uid: HOST_UID,
  email: "hello@divinex.io",
  displayName: "E2E",
  agencyId: AGENCY,
  subAccountId: SA,
  subAccountRole: "admin",
};
const roleCtx = { agencyRoleIsOwner: false, subAccountRole: "admin" };

/** One conversational turn-loop: exactly the chat route's shape. */
export async function ask(
  userText: string | string[],
  opts: {
    autoConfirm?: boolean;
    /** What the customer has on screen, exactly as the browser sends it. */
    pageContext?: { route?: string; resourceRef?: { kind: string; id: string; childId?: string } };
    /** Everything said so far, so a conversation continues rather than restarting. */
    priorMessages?: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string }[];
  } = {},
) {
  // A real conversation is more than one message. Zeno sometimes describes a
  // change and asks before calling the tool, which is a normal turn, not a
  // failure, so a case can supply the follow-up the customer would type.
  const userTurns = Array.isArray(userText) ? [...userText] : [userText];
  const { actions, lookups } = capabilityNamesForLevel("sub-account", roleCtx as never);
  // The page-context card, resolved exactly as the chat route resolves it.
  const contextCards: { id: string; levels: string[]; title: string; location: string; keywords: string[]; body: string }[] = [];
  if (opts.pageContext) {
    const { resolveCurrentResource, renderResourceContextLines } = await import(
      "../src/lib/ai-suite/context-resources"
    );
    const resource = await resolveCurrentResource(SA, {
      route: opts.pageContext.route,
      resourceRef: opts.pageContext.resourceRef,
    });
    if (resource) {
      contextCards.push({
        id: "zeno-current-resource",
        levels: ["sub-account"],
        title: "What the customer has open right now",
        location: "The screen they are on",
        keywords: ["this", "current", "open", "on screen"],
        body: renderResourceContextLines(resource).join("\n"),
      });
    }
  }
  const system = buildAiSuiteSystemPrompt({
    level: "sub-account",
    brandName: "DivineX",
    cards: contextCards,
    actionNames: actions,
    lookupNames: lookups,
    todayIso: new Date().toISOString().slice(0, 10),
    caller: { email: ctx.email, isAgencyOwner: false, workspaceName: String(saDoc.data()?.name ?? ""), workspaceRole: "admin" },
  } as never);

  const messages: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string }[] = [
    { role: "system", content: system },
    ...(opts.priorMessages ?? []),
    { role: "user", content: userTurns.shift()! },
  ];
  const tools = toolsForLevel("sub-account", roleCtx as never);
  const trace: string[] = [];

  for (let hop = 0; hop < 6; hop++) {
    const turn = await runAiSuiteTurn({ messages: messages as never, tools });
    const call = turn.toolCall;
    if (!call) {
      if (userTurns.length > 0) {
        trace.push(`ASKED: ${String(turn.text ?? "").slice(0, 80)}`);
        messages.push({ role: "assistant", content: turn.text }, { role: "user", content: userTurns.shift()! });
        continue;
      }
      return { kind: "text" as const, text: turn.text ?? "", trace, messages: [...messages.slice(1), { role: "assistant", content: turn.text }] };
    }

    const cap = AI_SUITE_CAPABILITIES.find((c) => c.name === call.name);
    if (!cap) return { kind: "error" as const, text: `unknown tool ${call.name}`, trace, messages: messages.slice(1) };

    if (cap.readonly) {
      const v = cap.validate(call.args);
      let out: string;
      if (!v.ok) { out = `Invalid arguments: ${v.error}.`; trace.push(`LOOKUP ${cap.name} REJECTED: ${v.error}`); }
      else {
        try { const r = await cap.execute(ctx as never, v.args); out = r.resultText; trace.push(`LOOKUP ${cap.name} ok`); }
        catch (e) { out = `The lookup couldn't run: ${e instanceof Error ? e.message : e}`; trace.push(`LOOKUP ${cap.name} THREW`); }
      }
      messages.push(
        { role: "assistant", content: turn.text, tool_calls: [{ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.args) } }] },
        { role: "tool", tool_call_id: call.id, content: out } as never,
      );
      continue;
    }

    // A write: the chat route validates and returns a PROPOSAL. Nothing runs
    // until the human confirms, which is the /confirm route re-validating the
    // stored args and executing.
    const v = cap.validate(call.args);
    if (!v.ok) { trace.push(`WRITE ${cap.name} args rejected: ${v.error}`); return { kind: "rejected" as const, text: v.error, capability: cap.name, trace, messages: messages.slice(1) }; }
    const summary = cap.summarize(v.args);
    trace.push(`PROPOSAL ${cap.name} :: ${summary}`);
    if (!opts.autoConfirm) return { kind: "proposal" as const, capability: cap.name, args: v.args, summary, trace, messages: messages.slice(1) };

    const reval = cap.validate(v.args); // the confirm route never trusts the stored payload
    if (!reval.ok) { trace.push(`CONFIRM re-validate FAILED: ${reval.error}`); return { kind: "error" as const, text: `re-validate failed: ${reval.error}`, trace, messages: messages.slice(1) }; }
    try {
      const r = await cap.execute(ctx as never, reval.args);
      trace.push(`EXECUTED ${cap.name}`);
      // The structural description travels too: the confirm route mints its
      // receipt from exactly this, so a case that checks what a screen would
      // be told has to see the same value.
      return {
        kind: "executed" as const,
        capability: cap.name,
        args: reval.args,
        summary,
        resultText: r.resultText,
        mutation: r.mutation,
        trace,
        // The transcript, plus what Zeno just did, so the next turn knows.
        messages: [...messages.slice(1), { role: "assistant", content: `[done] ${r.resultText}` }],
      };
    } catch (e) {
      const isUser = e instanceof CapabilityUserError;
      trace.push(`${isUser ? "REFUSED" : "THREW"} ${cap.name}: ${e instanceof Error ? e.message : e}`);
      return { kind: isUser ? ("refused" as const) : ("error" as const), capability: cap.name, text: e instanceof Error ? e.message : String(e), trace, messages: [...messages.slice(1), { role: "assistant", content: `[refused] ${e instanceof Error ? e.message : String(e)}` }] };
    }
  }
  return { kind: "error" as const, text: "hop limit", trace, messages: messages.slice(1) };
}

/**
 * A CONTINUING conversation: each step keeps the messages the last one
 * produced, which is how a person actually talks to Zeno. Separate ask()
 * calls are separate conversations, and a draft written in one is not
 * remembered in the next, which is realistic but tests something else.
 */
export function conversation(opts: { pageContext?: { route?: string; resourceRef?: { kind: string; id: string; childId?: string } } } = {}) {
  let prior: { role: string; content: string | null; tool_calls?: unknown; tool_call_id?: string }[] = [];
  return {
    async say(text: string | string[], o: { autoConfirm?: boolean } = {}) {
      const r = await ask(text, {
        ...o,
        priorMessages: prior,
        ...(opts.pageContext ? { pageContext: opts.pageContext } : {}),
      });
      // The real transcript, not a reconstruction of it.
      if ("messages" in r && Array.isArray(r.messages)) prior = r.messages as typeof prior;
      return r;
    },
  };
}

export function show(label: string, r: Awaited<ReturnType<typeof ask>>) {
  console.log(`\n### ${label}`);
  for (const t of r.trace) console.log(`    ${t}`);
  console.log(`    => ${r.kind}${"capability" in r && r.capability ? ` (${r.capability})` : ""}`);
  if ("summary" in r && r.summary) console.log(`    summary: ${r.summary}`);
  if ("text" in r && r.text) console.log(`    text: ${String(r.text).slice(0, 300)}`);
  if ("resultText" in r && r.resultText) console.log(`    result: ${String(r.resultText).slice(0, 300)}`);
}

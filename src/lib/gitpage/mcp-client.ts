import "server-only";

import { getApiKey, getBaseUrl } from "./client";

/**
 * Client for gitpage's MCP server (`/api/mcp`) — the only documented way to
 * edit a page gitpage already generated and published. The generate-site
 * API (client.ts) has no testimonials/stats/guarantee input at all
 * (confirmed against its full payload schema), so when the post-build
 * content audit flags invented social proof, the only real fix is editing
 * the live HTML gitpage already produced. See CLAUDE.md "Website builder ->
 * The actual fix — gitpage's MCP tools" for the documented tool sequence
 * this wraps: list_sites -> read_site_file -> edit_site_file ->
 * validate_draft -> publish_draft.
 *
 * Auth reuses the same GITPAGE_API_KEY as the generate-site API — gitpage's
 * own docs confirm no separate OAuth/connector setup is needed for
 * server-side MCP calls.
 *
 * Transport: standard MCP streamable-HTTP (JSON-RPC 2.0 over POST, response
 * either a single JSON object or an SSE stream of `data: {...}` frames —
 * both are handled below since the spec allows either per-request).
 */

const MCP_PATH = "/api/mcp";
const MCP_TIMEOUT_MS = 30_000;

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number | string;
  result?: T;
  error?: JsonRpcError;
}

export class GitpageMcpError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "GitpageMcpError";
  }
}

let requestCounter = 0;

/** Parses either a bare JSON response body or an SSE stream of `data:` frames,
 *  returning the LAST parsed JSON-RPC frame (the final result; intermediate
 *  frames in a streamed tool call are progress notifications we don't need). */
async function parseMcpResponse<T>(res: Response): Promise<JsonRpcResponse<T>> {
  const contentType = res.headers.get("content-type") ?? "";
  const body = await res.text();

  if (contentType.includes("text/event-stream")) {
    let last: JsonRpcResponse<T> | null = null;
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice("data:".length).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        last = JSON.parse(payload) as JsonRpcResponse<T>;
      } catch {
        // Non-JSON keepalive/comment frame — ignore.
      }
    }
    if (!last) {
      throw new GitpageMcpError("gitpage MCP returned an SSE stream with no parseable JSON-RPC frame");
    }
    return last;
  }

  try {
    return JSON.parse(body) as JsonRpcResponse<T>;
  } catch (err) {
    throw new GitpageMcpError(`gitpage MCP returned a non-JSON response: ${body.slice(0, 200)}`, err);
  }
}

async function callTool<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const url = `${getBaseUrl()}${MCP_PATH}`;
  const id = ++requestCounter;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MCP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new GitpageMcpError(`gitpage MCP request failed (tool=${name})`, err);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GitpageMcpError(`gitpage MCP returned ${res.status} for tool=${name}: ${text.slice(0, 300)}`);
  }

  const parsed = await parseMcpResponse<{ content?: Array<{ type: string; text?: string }>; isError?: boolean }>(res);
  if (parsed.error) {
    throw new GitpageMcpError(`gitpage MCP tool=${name} error: ${parsed.error.message}`, parsed.error);
  }
  const content = parsed.result?.content;
  if (parsed.result?.isError) {
    const text = content?.map((c) => c.text).filter(Boolean).join(" ") ?? "unknown error";
    throw new GitpageMcpError(`gitpage MCP tool=${name} reported failure: ${text}`);
  }

  // MCP tool results come back as a `content` array of typed blocks. Every
  // tool this file calls returns a single text block carrying JSON — parse
  // it; fall back to the raw text for tools with a plain-string result.
  const textBlock = content?.find((c) => c.type === "text")?.text;
  if (textBlock === undefined) {
    // Some tools (validate_draft/publish_draft) may return structurally in
    // `result` directly rather than via `content` — support both shapes.
    return (parsed.result as unknown) as T;
  }
  try {
    return JSON.parse(textBlock) as T;
  } catch {
    return (textBlock as unknown) as T;
  }
}

export interface GitpageSiteSummary {
  pageId: string;
  formResponseId?: string;
  repoName?: string;
  name?: string;
}

/** Maps our `gitpageJobId` (the generate-site API's `formResponseId`) to the
 *  MCP-space `pageId` the rest of these calls need. */
export async function listSites(): Promise<GitpageSiteSummary[]> {
  const result = await callTool<{ sites?: GitpageSiteSummary[] } | GitpageSiteSummary[]>("list_sites", {});
  return Array.isArray(result) ? result : result.sites ?? [];
}

/**
 * `formResponseId` is OUR internal build-job id (shape `build_<ms>_<rand>`,
 * stamped at submit time — see client.ts). Live testing against a real
 * published site found that `list_sites` entries don't actually carry that
 * id as `formResponseId`/`repoName`/`name` at all, so the direct match
 * always missed — this remediation path had apparently never been exercised
 * against a real gitpage site before. `liveUrlSlug` (the published URL's
 * last path segment, e.g. the `river-oaks-medspa-2026-10-24-a2k7m` in
 * `https://hello1534.gitlab.io/river-oaks-medspa-2026-10-24-a2k7m`) IS
 * ground truth we already have for a published site — it's the repo name
 * gitpage itself chose — so it's checked as a fallback, never a guess.
 */
export interface PageIdLookupResult {
  pageId: string | null;
  /** Diagnostics for the not-found case — surfaced in the caller's error
   *  message rather than swallowed, so "no match" is debuggable without
   *  a one-off script: is list_sites returning everything we'd expect, or
   *  is this agency's site missing from it entirely? */
  totalSites: number;
  sampleRepoNames: string[];
}

export async function findPageIdForJob(formResponseId: string, liveUrlSlug?: string): Promise<PageIdLookupResult> {
  const sites = await listSites();
  const direct = sites.find(
    (s) => s.formResponseId === formResponseId || s.repoName === formResponseId || s.name === formResponseId,
  );
  const bySlug = !direct && liveUrlSlug ? sites.find((s) => s.repoName === liveUrlSlug || s.name === liveUrlSlug) : undefined;
  return {
    pageId: direct?.pageId ?? bySlug?.pageId ?? null,
    totalSites: sites.length,
    sampleRepoNames: sites.slice(0, 5).map((s) => s.repoName ?? s.name ?? s.pageId),
  };
}

export async function readSiteFile(pageId: string, path: string): Promise<{ content: string; sha: string }> {
  return callTool<{ content: string; sha: string }>("read_site_file", { pageId, path });
}

export async function editSiteFile(
  pageId: string,
  path: string,
  edit: { old_string: string; new_string: string; replace_all?: boolean },
): Promise<void> {
  await callTool("edit_site_file", { pageId, path, ...edit });
}

export interface ValidateDraftResult {
  valid: boolean;
  errors?: string[];
}

export async function validateDraft(pageId: string): Promise<ValidateDraftResult> {
  return callTool<ValidateDraftResult>("validate_draft", { pageId });
}

export interface PublishDraftResult {
  liveUrl: string;
}

export async function publishDraft(pageId: string): Promise<PublishDraftResult> {
  return callTool<PublishDraftResult>("publish_draft", { pageId });
}

export async function restorePreviousVersion(pageId: string): Promise<void> {
  await callTool("restore_previous_version", { pageId });
}

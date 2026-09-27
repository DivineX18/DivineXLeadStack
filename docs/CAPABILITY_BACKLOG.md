# Zeno capability backlog

Gaps found while building something else, recorded rather than absorbed
into the workstream that happened to surface them.

## Form positional insertion

`update_form` appends a question to the end. It has no positional insert,
so "Add Company **after Email**" adds Company last and the placement is
silently ignored. Found during W2's live E2E; W2 verified only that the
correct form was resolved and the existing questions were preserved.

Not W3 behaviour, and deliberately not fixed during W3: it is a change to
a certified capability's arguments and validation, which wants its own
tests rather than a drive-by edit.

To fix: an optional `after_field_id` on `add_question`, validated against
the stored field list, with the existing refusals unchanged.

## Cross-turn recovery (permanent rule, from W4 and W5)

An id a capability returns is invisible to the next human turn: a tool
result is not part of the conversation the browser replays. Three
defects came from this, and each got worse: a member that could not be
changed, an email draft reported as nonexistent, and it would have been
a social post published twice.

So: anything a person may refer to later needs a workspace-scoped way to
be found again, written BEFORE the editing that depends on it.
list_members, list_email_drafts and list_social_posts exist for this.

## Social publish E2E: blocked

Everything up to the Graph API is tested. The publish itself is not,
because Meta has no sandbox that accepts a post without showing it to
people. Needs a disposable Facebook Page. See the W5 report.

## Social analytics: not available

Nothing in this codebase reads Graph insights. Publishing is supported;
performance ingestion does not exist, and Zeno says so rather than
guessing. A later improvement, not a gap in W5.

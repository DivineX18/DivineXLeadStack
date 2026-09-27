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

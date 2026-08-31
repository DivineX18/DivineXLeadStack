# RC human test — punch list

Findings from the frozen release-candidate human test.
Flow `dev` @ `9d7f990` · Ascend `brand-asset-classification` @ `e4dc534`.

**Nothing here is fixed during the test.** Each item is categorised, then
reconciled against P0.1–P0.7 before any work starts. Fixing visible symptoms
mid-test obscures the underlying system problem.

Categories: `bug` · `UX` · `visual-quality` · `missing capability` ·
`already-planned-P0`

---

## 1. Hero placeholder asks for a video on an image slot — `bug`

**Observed:** "Mobile Notary Services" (`hrDOCuJag5JpmPEXdZbH`, 14:57 2026-08-31)

```
hero  mediaType=image  placeholder="Add a video"
      brief="Mobile notary at a client's kitchen table or desk, w…"
```

Three parts of one slot disagree: the type resolved to `image`, the brief
describes a photograph, the label asks for a video.

**Cause (suspected, not yet confirmed):** the placeholder label is not derived
from the resolved `mediaType`, so it can contradict both the type and its own
brief.

**Not a judgment failure.** The Image Director decided correctly — image, with
a specific brief. Only the label failed to follow. Small and contained.

**Fix in:** P0.5, alongside the Director work that owns this slot.

---

## 2. Placeholder instead of an image — `already-planned-P0` (P0.5)

**Observed:** same page. The operator would rather see an image than a gap.

Covered by §13's "what asset type is appropriate?" and "does a first-party
asset exist?".

**Worth recording as progress:** this page resolved `mediaType=image` with a
specific shooting brief. The pages generated hours earlier were
`mediaType=none` followed by a dense gallery. The system is now making the
right visual decision even when it cannot complete the visual automatically —
which is the harder half.

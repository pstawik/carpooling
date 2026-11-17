<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Group page UI

- **Plan**: context/changes/group-page-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-11-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Evidence summary:
- Plan drift: every planned change MATCH; no DRIFT/MISSING. Diff covers only planned files plus change-folder docs.
- Gates on 8a07c1b: `npm run lint` PASS (`check-ui-literals: 0 hits in 5 files`), `npx astro check` 0 errors, `npm run build` PASS. CI `ci`/`smoke` SUCCESS on 0e1ea18.
- Security: no `set:html`/`dangerouslySetInnerHTML`; admin gating (`isAdmin`) and invite-token fetch unchanged; non-member 404 kept; `/dev/ui-group` compiles to `Astro.rewrite("/404")` in production.
- Manual Progress rows 2.6–2.7, 3.6–3.9, 4.5–4.7, 5.5 confirmed by the user in-session; 4.7 backed by 4 PNGs in `screenshots/`.

## Findings

### F1 — Literal scan misses some palette prefixes and units, flags hex-like anchors

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/check-ui-literals.mjs:20
- **Detail**: The regex (identical to the /10x-ui scan, as planned) does not catch `border-t-white`, `border-x-red-500`, `ring-offset-white`, `placeholder-white/40` (already used in `admin/groups.astro` and `auth/FormField.tsx`), `caret-*`, `accent-*`, `decoration-*`, nor arbitrary values in `em`/`%` or negatives (`w-[13em]`, `top-[-4px]`). It false-positives on hex-looking anchors such as `href="#add"` or `#face`. Today's 5 files are clean either way; the gaps bite when the next views join `CLEANED_VIEWS`.
- **Fix A ⭐ Recommended**: Widen the prefix group to `(bg|text|border(-[trblxyse])?|ring(-offset)?|outline|from|via|to|fill|stroke|shadow|divide|placeholder|caret|accent|decoration)`, arbitrary values to `-\[-?[0-9.]+(px|rem|em|%)\]`, and require the hex not to be preceded by `"`/`'`/word char: `(?<![\w"'/])#[0-9a-fA-F]{3,8}\b(?!-)`.
  - Strength: Guard keeps pace with the classes already present in views that will be cleaned next.
  - Tradeoff: Script regex diverges from the skill's grep; the /10x-ui manual scan stays narrower.
  - Confidence: HIGH — samples tested in node by the reviewer.
  - Blind spot: Lookbehind excludes `#abc` directly after a quote in style attributes (`style="color:#fff"` still matches via `:`).
- **Fix B**: Keep the regex identical to /10x-ui and add a comment listing the known gaps.
  - Strength: One scan definition across skill and lint.
  - Tradeoff: The guard silently passes `placeholder-white/40` when `FormField` is cleaned.
  - Confidence: MED — depends on future cleanups remembering the gap.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — regex widened in scripts/check-ui-literals.mjs; 18 hit / 11 clean samples verified in node; `npm run lint` 0 hits in 5 files

### F2 — Default Button focus ring is 50% opacity

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/button.tsx:8
- **Detail**: Default-variant buttons ("Dodaj dziecko", "Zapisz", "Kopiuj", …) show focus only as `focus-visible:ring-ring/50` — 3 px of purple-400 at 50% on a purple-600 button over navy. That is likely below WCAG 1.4.11 3:1 for non-text contrast. Outline buttons and inputs also get a solid `border-ring` and are fine. The 4.6 manual check passed visually, so this is a contrast concern, not a missing ring.
- **Fix A ⭐ Recommended**: In `button.tsx` base classes replace `focus-visible:ring-ring/50` with `focus-visible:ring-ring` (keep 3 px), matching the solid outline used on links/summaries.
  - Strength: One edit fixes every Button app-wide; other pages override colours, not focus, so they inherit the better ring.
  - Tradeoff: Edits a shadcn-generated file (future `shadcn add button` would overwrite it).
  - Confidence: MED — contrast estimated, not measured.
  - Blind spot: Have not measured the exact ratio against the button fill.
- **Fix B**: Add `focus-visible:ring-ring` only to `submitClass`/`buttonClass` in the group view and components.
  - Strength: Leaves `ui/button.tsx` pristine.
  - Tradeoff: Fix lives in view classes; other views keep the weak ring.
  - Confidence: HIGH — narrow, local change.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — `focus-visible:ring-ring` (full opacity) in src/components/ui/button.tsx base classes

### F3 — PR #41 head not synced with the pushed branch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: PR #41
- **Detail**: `origin/group-page-ui` is at 8a07c1b (close-out commit), but `gh pr view 41` still reports head 0e1ea18; CI has not run on 8a07c1b. The close-out commit only touches `plan.md`/`change.md`, so risk is low, but merging an unsynced PR would merge the stale head.
- **Fix**: Close and reopen PR #41 (or push an empty commit) to force a sync, confirm `headRefOid == 8a07c1b`, and wait for green CI before merging.
- **Decision**: FIXED (differently) — PR #41 had already been merged at 0e1ea18 (merge f0e9c5f), which is why its head never moved. The close-out (8a07c1b) and review-fix (4f72dd6) commits went to follow-up PR #43 with `Closes #42`. #43's head was verified as 4f72dd6 with green `ci`/`smoke`, and it was merged as 03c3857, which closed #42.

### F4 — `--popover` token is translucent

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/styles/global.css (`.dark`, `--popover`)
- **Detail**: `--popover` was mapped to `oklch(1 0 0 / 10%)` like `--card`. Nothing uses it today, but a future shadcn Select/Dropdown/Popover would render see-through over content.
- **Fix**: Give `--popover` an opaque navy value (e.g. the card-over-background blend) and record it in `tokens.md`, before adding any overlay component.
- **Decision**: FIXED — `--popover: oklch(0.26 0.02 270)` (≈ #232631, white 10% over #0a0e1a) in `.dark`; tokens.md row updated

### F5 — Class constants duplicated between the view and the kitchen sink

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/groups/[id].astro:55-86, src/pages/dev/ui-group.astro:30-44
- **Detail**: `cardClass`, `inputClass`, `selectClass`, `labelClass`, `submitClass`, `planLinkClass`, `summaryClass`, `linkButtonClass` are hand-copied into the kitchen sink; `selectClass` is a hand-written mirror of `Input` for the native `<select>`. If the view changes, the gate page silently drifts. Already listed as deferred in research.md.
- **Fix**: Move the shared constants to `src/components/groups/group-page-classes.ts` (or add `ui/native-select.tsx` for the select) and import them in both pages.
  - Strength: Kitchen sink stays representative by construction.
  - Tradeoff: A small new module; touches both files.
  - Confidence: HIGH — plain constant extraction.
  - Blind spot: None significant.
- **Decision**: FIXED — shared constants in src/components/groups/group-page-classes.ts, imported by [id].astro and dev/ui-group.astro; module added to CLEANED_VIEWS (lint: 0 hits in 6 files)

### F6 — Unplanned but benign additions

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/groups/[id].astro:130, 216, 249; scripts/check-ui-literals.mjs:28-31
- **Detail**: Not described in the plan: cards as `role="region"` + `aria-labelledby` (replacing `<section>`), h3 sub-headings inside "Zarządzaj terminami", `selectClass` for the native select, a missing-file failure in the lint script, and "Zarządzaj terminami" opening on any terminy error (incl. edit/delete errors). All stay within the plan's intent.
- **Fix**: Accept; optionally note them in a short addendum under the plan's Phase 3/5 blocks.
- **Decision**: FIXED — accepted; `## Addendum` added to plan.md (before References) listing the additions and the review fixes F1, F2, F4, F5

### F7 — "Dodaj termin" is now one tap deeper for admins

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/pages/groups/[id].astro:211
- **Detail**: The add-event form used to be always visible to admins; it now sits collapsed in "Zarządzaj terminami". This is the planned C5 reorder, and the `summary` hides the native disclosure triangle (deferred), so the affordance is weak.
- **Fix**: Accept as planned; consider opening the `details` by default when the group has no upcoming events.
- **Decision**: FIXED — `open={Boolean(eventError) || upcoming.length === 0}` in [id].astro

### F8 — Topbar still uses palette literals on the cleaned page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/Topbar.astro
- **Detail**: The group page renders `Topbar` with `border-white/10 bg-white/5 text-white/80`, next to a token-based view. Expected for a one-view change and already deferred in research.md; sibling pages `terminy/[eventId].astro` and `statystyki.astro` are the natural next `CLEANED_VIEWS` entries.
- **Fix**: Clean `Topbar.astro` in the next `/10x-ui` change and add it to `CLEANED_VIEWS`.
- **Decision**: FIXED (now, in this change) — Topbar on tokens (`border-border`, `bg-card/50`, `text-foreground/80`, `text-muted-foreground`), new `--link` token (purple-300 in `.dark`, published as `--color-link`, recorded in tokens.md), focus-visible ring on its links; added to `CLEANED_VIEWS` (lint: 0 hits in 7 files)

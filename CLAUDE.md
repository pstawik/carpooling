# Rules for AI

Project rules for agents live in AGENTS.md (shared with non-Claude tools) and are imported here:

@AGENTS.md

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 5 (10xDevs 4.0 UI)

**For UI work on a view that already renders, start with `/10x-ui <view>`.** It is the
entry point: a short pre-audit, a suggested change-id and the `/10x-new` command for you to
run, then the audit brief for `/10x-research`. The visual change goes through the same chain
as any other change (`/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement` →
`/10x-impl-review`); `/10x-ui <change-id>` resumes at the first step not yet done. It carries
the rules:
when to start and which view, the audit into charges, the design-system contract as
this repo realises it, the component states, the screenshot gate, and the rule that
keeps the next agent on the contract. Its `references/` hold the quality checklist.

Building a view for the first time is not a `/10x-ui` job — build it through the
ordinary chain, then come back to it with `/10x-ui`.

<!-- END @przeprogramowani/10x-cli -->

# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Commit subjects follow AGENTS.md, not the skill's Conventional Commits format

- **Context**: /10x-implement phase-end commits (app-admin-creates-group: 62ac45b, 3037a25, 77b7b0f, d5be428, 18b251b)
- **Problem**: The /10x-implement ritual proposes `<type>(<change-id>): <phase title> (pN)`, but AGENTS.md says commit subjects are "short, imperative, sentence case with no prefix". The skill format was used and the repo convention was broken.
- **Rule**: When proposing a commit, AGENTS.md wins: a short, imperative, sentence-case subject with no `type(scope):` prefix. Keep the phase index as a trailing `(pN)`, e.g. "Add member group views (p3)". Put the change-id in the body.
- **Applies to**: /10x-implement phase and epilogue commits, and any other agent-authored commit in this repo

---
name: 10x-new-plan
description: Start a new change and plan it in one run - creates context/changes/<change-id>/change.md the way /10x-new does, then continues straight into /10x-plan for that change. Use when the user wants to open a change and go directly to an implementation plan, or says "new change and plan it", "start and plan", "nowa zmiana i plan". Use /10x-new-research instead when the change needs codebase exploration first.
argument-hint: "<change-id-or-path> [freeform intent]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Write
  - Edit
  - Bash
  - Agent
  - Task
  - Skill
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
---

# /10x-new-plan — Start a New Change and Plan It

Run two skills back to back in one invocation: `/10x-new` creates the change folder, then `/10x-plan` writes the plan for it. The user types one command instead of two and never copies a change-id between them.

This skill holds no rules of its own about change folders or plans. `10x-new` and `10x-plan` stay the single source for both stages; this skill only sequences them and passes the change-id and intent across.

## Before you start: both skills must be installed

Find the two skills before creating anything:

- Use the host's native skill mechanism when it has one (Claude Code `Skill` tool, or the equivalent in Codex and OpenCode).
- Otherwise read each `SKILL.md` from the sibling directories of this skill: `<loaded-skill-dir>/../10x-new/SKILL.md` and `<loaded-skill-dir>/../10x-plan/SKILL.md`.

If either skill is missing, print the message below and **STOP** without creating a change folder. A change opened here with no way to plan it is worse than no change.

```
error: /10x-new-plan needs both 10x-new and 10x-plan installed. Missing: <skill-name>.
Install the missing skill, then run /10x-new-plan again.
```

## Stage 1: create the change (`10x-new`)

Load `10x-new` and follow it in full with the arguments this skill received, unchanged: its no-argument message, argument parsing, validation and creation steps all apply as written.

Two differences from a standalone `/10x-new` run:

1. **Skip its "Next-step suggestion" section.** Don't pick a next command, don't copy anything to the clipboard and don't print the "Next step" block. Print only the confirmation line: `✓ Created context/changes/<change-id>/change.md (status: new)`.
2. **A stop in `10x-new` stops this skill.** If it asks for a missing argument, wait for the answer and then continue here. If validation fails (not kebab-case, change already exists, `context/changes/` missing), print its error and stop. Never plan against a folder this run did not create: for an existing change, the user runs `/10x-plan <change-id>` directly.

## Stage 2: plan the change (`10x-plan`)

Continue in the same turn. Don't ask the user whether to go on; running this skill was the answer.

Load `10x-plan` and follow it in full, as if the user had invoked `/10x-plan <change-id>` with the change-id from Stage 1:

- **Task description** is the freeform intent from the arguments, the same text Stage 1 stored under `## Notes` in `change.md`. Read `change.md` back and treat it as a provided file, so `10x-plan` skips its no-parameters message and begins its research.
- **Empty intent**: the change has a name but no task. Let `10x-plan` ask for the task description as it does when invoked without one, then go on.
- **Upstream artifacts**: a change created a moment ago has no `frame.md` or `research.md`, so `10x-plan` questions at its "task only" baseline.

Everything else belongs to `10x-plan` and is not relaxed here: its native-question prerequisites, complexity and budget confirmation, the interview, structure approval, `plan.md` and `plan-brief.md`, and its `change.md` metadata update. If `10x-plan` stops for a missing host capability (for example no structured question tool, or a read-only mode), the change folder from Stage 1 stays in place. Tell the user it exists and that `/10x-plan <change-id>` resumes from there.

## Closing

End with the closing that `10x-plan` prescribes. Add one line naming the change folder created at the start, so the user sees both results of the run.

## What this skill does NOT do

- Does not restate or override the rules of `10x-new` or `10x-plan`. When this file and either skill disagree, the skill wins.
- Does not run `/10x-frame` or `/10x-research` in between. When the intent reads as a suspect framing (a bug with a proposed fix attached, "should we even") or needs codebase exploration before a plan can be written, say so in one line before Stage 2 and continue. The user asked for a plan and can stop the run.
- Does not plan an existing change and does not write to `context/archive/`.

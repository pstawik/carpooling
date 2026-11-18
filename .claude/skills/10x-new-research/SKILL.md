---
name: 10x-new-research
description: Start a new change and research it in one run - creates context/changes/<change-id>/change.md the way /10x-new does, then continues straight into /10x-research for that change. Use when the user wants to open a change and explore the codebase before planning, or says "new change and research it", "start and research", "nowa zmiana i research". Use /10x-new-plan instead when the change can go directly to a plan.
argument-hint: "<change-id-or-path> [freeform intent or research question]"
allowed-tools:
  - Read
  - Glob
  - Grep
  - Write
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

# /10x-new-research — Start a New Change and Research It

Run two skills back to back in one invocation: `/10x-new` creates the change folder, then `/10x-research` investigates the codebase and saves `research.md` in it. The user types one command instead of two and never copies a change-id between them.

This skill holds no rules of its own about change folders or research. `10x-new` and `10x-research` stay the single source for both stages; this skill only sequences them and passes the change-id and intent across.

## Before you start: both skills must be installed

Find the two skills before creating anything:

- Use the host's native skill mechanism when it has one (Claude Code `Skill` tool, or the equivalent in Codex and OpenCode).
- Otherwise read each `SKILL.md` from the sibling directories of this skill: `<loaded-skill-dir>/../10x-new/SKILL.md` and `<loaded-skill-dir>/../10x-research/SKILL.md`.

If either skill is missing, print the message below and **STOP** without creating a change folder. A change opened here with no way to research it is worse than no change.

```
error: /10x-new-research needs both 10x-new and 10x-research installed. Missing: <skill-name>.
Install the missing skill, then run /10x-new-research again.
```

## Stage 1: create the change (`10x-new`)

Load `10x-new` and follow it in full with the arguments this skill received, unchanged: its no-argument message, argument parsing, validation and creation steps all apply as written.

Two differences from a standalone `/10x-new` run:

1. **Skip its "Next-step suggestion" section.** Don't pick a next command, don't copy anything to the clipboard and don't print the "Next step" block. Print only the confirmation line: `✓ Created context/changes/<change-id>/change.md (status: new)`.
2. **A stop in `10x-new` stops this skill.** If it asks for a missing argument, wait for the answer and then continue here. If validation fails (not kebab-case, change already exists, `context/changes/` missing), print its error and stop. Never research into a folder this run did not create: for an existing change, the user runs `/10x-research <change-id>` directly.

## Stage 2: research the change (`10x-research`)

Continue in the same turn. Don't ask the user whether to go on; running this skill was the answer.

Load `10x-research` and follow it in full, as if the user had invoked `/10x-research <change-id>` with the change-id from Stage 1:

- **Research question** comes from the freeform intent in the arguments, the same text Stage 1 stored under `## Notes` in `change.md`. `10x-research` reads the change's artifacts to establish the question, so don't ask the user to repeat it.
- **Empty intent**: the change has a name but no question. Let `10x-research` ask for the missing question as it does when neither the message nor the artifacts define one, then go on.
- **The change folder and `change.md` already exist**, so `10x-research` saves `research.md` there and updates `change.md` only through its own metadata step. It must not create a second folder or derive another change-id from the topic.

Everything else belongs to `10x-research` and is not relaxed here: scope clarification, parallel investigation, synthesis, the checks it runs before writing `research.md`, and its `change.md` metadata update. If `10x-research` cannot save (for example in a read-only mode), the change folder from Stage 1 stays in place. Tell the user it exists and that `/10x-research <change-id>` resumes from there.

## Closing

End with the presentation that `10x-research` prescribes. Add one line naming the change folder created at the start, so the user sees both results of the run. Research does not imply approval for a plan: name `/10x-plan <change-id>` as the next step, and don't start it.

## What this skill does NOT do

- Does not restate or override the rules of `10x-new` or `10x-research`. When this file and either skill disagree, the skill wins.
- Does not run `/10x-frame` or `/10x-plan`. When the intent reads as a suspect framing (a bug with a proposed fix attached, "should we even"), say so in one line before Stage 2 and continue. The user asked for research and can stop the run.
- Does not research an existing change and does not write to `context/archive/`.

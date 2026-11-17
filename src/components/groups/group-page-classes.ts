import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Class constants shared by the group page (src/pages/groups/[id].astro), the event plan
// (src/pages/groups/[id]/terminy/[eventId].astro), the group statistics (src/pages/groups/[id]/statystyki.astro)
// and the kitchen sinks (src/pages/dev/ui-group.astro, src/pages/dev/ui-event.astro, src/pages/dev/ui-stats.astro),
// so the visual gate
// always shows what the views render.
// Token classes only — see the UI rules in AGENTS.md.

/** shadcn Input is h-9; every control on the group page stays at least 44 px tall for touch. */
export const inputClass = "h-auto min-h-11 py-2";

/** The native <select> has no ui/ component: it gets the same tokens as Input. */
export const selectClass =
  "border-input text-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-11 w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-3 md:text-sm";

export const labelClass = "text-muted-foreground block text-sm";

/** Keyboard focus uses the --ring token (focus-visible only, so a mouse click shows no outline). */
export const focusRingClass =
  "focus-visible:outline-ring rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2";

/** The date label of every event, upcoming or past, opens its child plan. */
export const planLinkClass = cn(
  "flex min-h-11 items-center break-words underline-offset-4 hover:underline",
  focusRingClass,
);

export const summaryClass = cn(
  "text-muted-foreground flex min-h-11 cursor-pointer items-center text-sm font-semibold",
  focusRingClass,
);

export const cardClass = "mb-6 gap-0 p-4 backdrop-blur-xl sm:p-6";

export const submitClass = "h-auto min-h-11 w-full whitespace-normal";

export const linkButtonClass = cn(buttonVariants({ variant: "outline" }), "h-auto min-h-11 whitespace-normal");

/** A small muted heading inside a card, e.g. "Jadą (2)" / "Nie jadą (1)" in the child plan. */
export const subHeadingClass = "text-muted-foreground mb-2 text-sm font-semibold";

/** A text link inside a muted hint, e.g. "Dodaj dziecko na stronie grupy" for a parent without children. */
export const hintLinkClass = cn(planLinkClass, "text-link inline-flex");

/** One child or driver row inside an event plan card; the border colour comes from --border (base layer). */
export const listItemClass = "bg-secondary/50 rounded-xl border p-3";

/** A driver's phone number: a dialable link in the --link colour, 44 px tall for touch. */
export const phoneLinkClass = cn(
  "text-link inline-flex min-h-11 items-center break-all underline-offset-4 hover:underline",
  focusRingClass,
);

import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EventItemProps {
  groupId: string;
  eventId: string;
  /** Formatted start in Warsaw, e.g. "wtorek, 17 listopada 2026, 17:00". */
  label: string;
  note: string | null;
  /** Warsaw date ("YYYY-MM-DD") and time ("HH:MM") to prefill the edit form. */
  date: string;
  time: string;
  /** The event's child plan page. */
  planHref: string;
}

// Size only: the colours come from the Button variants. Touch targets stay at least 44 px.
const buttonClass = "h-auto min-h-11 whitespace-normal";
// shadcn Input is h-9; the edit form keeps 44 px touch targets.
const inputClass = "h-auto min-h-11 py-2";
const labelClass = "text-muted-foreground block text-sm";
const planLinkClass = "flex min-h-11 items-center font-medium break-words underline-offset-4 hover:underline";

/** An upcoming event as the group admin sees it: read mode with "Edytuj" / "Usuń", or an inline edit form. */
export default function EventItem({ groupId, eventId, label, note, date, time, planHref }: EventItemProps) {
  const [editing, setEditing] = useState(false);
  const idPrefix = `event-${eventId}`;

  function confirmDelete(event: SubmitEvent<HTMLFormElement>) {
    if (!window.confirm(`Usunąć termin ${label}? Deklaracje tego terminu też zostaną usunięte.`)) {
      event.preventDefault();
    }
  }

  if (editing) {
    return (
      <form method="POST" action="/api/groups/events/update" className="space-y-2">
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="event_id" value={eventId} />
        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <label htmlFor={`${idPrefix}-date`} className={labelClass}>
              Data
            </label>
            <Input
              id={`${idPrefix}-date`}
              name="date"
              type="date"
              required
              defaultValue={date}
              autoFocus
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${idPrefix}-time`} className={labelClass}>
              Godzina
            </label>
            <Input
              id={`${idPrefix}-time`}
              name="time"
              type="time"
              required
              defaultValue={time}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-note`} className={labelClass}>
            Notatka (opcjonalnie)
          </label>
          <Input
            id={`${idPrefix}-note`}
            name="note"
            type="text"
            maxLength={200}
            defaultValue={note ?? ""}
            autoComplete="off"
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className={cn(buttonClass, "flex-1")}>
            Zapisz
          </Button>
          <Button
            type="button"
            onClick={() => {
              setEditing(false);
            }}
            variant="outline"
            className={cn(buttonClass, "flex-1")}
          >
            Anuluj
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-0 flex-1">
        <a href={planHref} className={planLinkClass}>
          {label}
        </a>
        {note && <p className="text-muted-foreground text-sm break-words">{note}</p>}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => {
            setEditing(true);
          }}
          variant="outline"
          className={buttonClass}
        >
          Edytuj
        </Button>
        <form method="POST" action="/api/groups/events/delete" onSubmit={confirmDelete}>
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="event_id" value={eventId} />
          <Button type="submit" variant="outline" className={buttonClass}>
            Usuń
          </Button>
        </form>
      </div>
    </div>
  );
}

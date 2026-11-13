import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
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

const buttonClass = "h-auto min-h-11 rounded-lg px-4 py-2 font-medium whitespace-normal transition-colors";
const primaryClass = "bg-purple-600 text-white hover:bg-purple-500";
const secondaryClass = "border border-white/20 bg-white/10 text-white hover:bg-white/20";
const inputClass =
  "min-h-11 w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none";
const labelClass = "block text-sm text-blue-100/80";
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
            <input
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
            <input
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
          <input
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
          <Button type="submit" className={cn(buttonClass, primaryClass, "flex-1")}>
            Zapisz
          </Button>
          <Button
            type="button"
            onClick={() => {
              setEditing(false);
            }}
            className={cn(buttonClass, secondaryClass, "flex-1")}
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
        {note && <p className="text-sm break-words text-blue-100/70">{note}</p>}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => {
            setEditing(true);
          }}
          className={cn(buttonClass, secondaryClass)}
        >
          Edytuj
        </Button>
        <form method="POST" action="/api/groups/events/delete" onSubmit={confirmDelete}>
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="event_id" value={eventId} />
          <Button type="submit" className={cn(buttonClass, secondaryClass)}>
            Usuń
          </Button>
        </form>
      </div>
    </div>
  );
}

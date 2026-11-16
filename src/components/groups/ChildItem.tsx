import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ChildItemProps {
  groupId: string;
  childId: string;
  name: string;
}

// Size only: the colours come from the Button variants. Touch targets stay at least 44 px.
const buttonClass = "h-auto min-h-11 whitespace-normal";

/** One of the current parent's own children: read mode with "Edytuj" / "Usuń", or an inline rename form. */
export default function ChildItem({ groupId, childId, name }: ChildItemProps) {
  const [editing, setEditing] = useState(false);
  const inputId = `child-name-${childId}`;

  function confirmDelete(event: SubmitEvent<HTMLFormElement>) {
    if (!window.confirm(`Usunąć dziecko ${name}?`)) {
      event.preventDefault();
    }
  }

  if (editing) {
    return (
      <form method="POST" action="/api/groups/children/update" className="space-y-2">
        <input type="hidden" name="group_id" value={groupId} />
        <input type="hidden" name="child_id" value={childId} />
        <label htmlFor={inputId} className="sr-only">
          Nowe imię lub nick dziecka
        </label>
        <Input
          id={inputId}
          name="name"
          type="text"
          required
          maxLength={40}
          defaultValue={name}
          autoFocus
          className="h-auto min-h-11 py-2"
        />
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
      <span className="min-w-0 flex-1 font-medium break-words">{name}</span>
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
        <form method="POST" action="/api/groups/children/delete" onSubmit={confirmDelete}>
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="child_id" value={childId} />
          <Button type="submit" variant="outline" className={buttonClass}>
            Usuń
          </Button>
        </form>
      </div>
    </div>
  );
}

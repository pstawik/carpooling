import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChildItemProps {
  groupId: string;
  childId: string;
  name: string;
}

const buttonClass = "h-auto min-h-11 rounded-lg px-4 py-2 font-medium whitespace-normal transition-colors";
const primaryClass = "bg-purple-600 text-white hover:bg-purple-500";
const secondaryClass = "border border-white/20 bg-white/10 text-white hover:bg-white/20";

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
        <input
          id={inputId}
          name="name"
          type="text"
          required
          maxLength={40}
          defaultValue={name}
          autoFocus
          className="min-h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
        />
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
      <span className="min-w-0 flex-1 font-medium break-words">{name}</span>
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
        <form method="POST" action="/api/groups/children/delete" onSubmit={confirmDelete}>
          <input type="hidden" name="group_id" value={groupId} />
          <input type="hidden" name="child_id" value={childId} />
          <Button type="submit" className={cn(buttonClass, secondaryClass)}>
            Usuń
          </Button>
        </form>
      </div>
    </div>
  );
}

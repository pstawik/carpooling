import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";

interface InvitePanelProps {
  /** Full invite URL, built on the server from the request origin. */
  url: string;
  groupId: string;
}

const COPIED_RESET_MS = 2000;

// Size only: the colours come from the Button variants. Touch targets stay at least 44 px.
const buttonClass = "h-auto min-h-11 w-full whitespace-normal";

export default function InvitePanel({ url, groupId }: InvitePanelProps) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, COPIED_RESET_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard API unavailable or denied: select the text so the user can copy it by hand.
      fieldRef.current?.focus();
      fieldRef.current?.select();
    }
  }

  function confirmRegenerate(event: SubmitEvent<HTMLFormElement>) {
    if (!window.confirm("Poprzedni link przestanie działać. Kontynuować?")) {
      event.preventDefault();
    }
  }

  return (
    <div className="space-y-3">
      <label htmlFor="invite-url" className="text-muted-foreground block text-sm">
        Wyślij ten link rodzicom z grupy
      </label>
      <textarea
        id="invite-url"
        ref={fieldRef}
        readOnly
        rows={2}
        value={url}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        className="border-input text-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full resize-none rounded-md border bg-transparent px-3 py-2 font-mono text-sm break-all shadow-xs outline-none focus-visible:ring-3"
      />
      <Button type="button" onClick={copy} aria-live="polite" className={buttonClass}>
        {copied ? "Skopiowano" : "Kopiuj"}
      </Button>
      <form method="POST" action="/api/groups/invite" onSubmit={confirmRegenerate}>
        <input type="hidden" name="group_id" value={groupId} />
        <Button type="submit" variant="outline" className={buttonClass}>
          Wygeneruj nowy link
        </Button>
      </form>
    </div>
  );
}

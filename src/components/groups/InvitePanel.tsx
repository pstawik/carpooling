import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface InvitePanelProps {
  /** Full invite URL, built on the server from the request origin. */
  url: string;
  groupId: string;
}

const COPIED_RESET_MS = 2000;

const buttonClass = "h-auto min-h-11 w-full rounded-lg px-4 py-2 font-medium whitespace-normal transition-colors";

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
      <label htmlFor="invite-url" className="block text-sm text-blue-100/80">
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
        className="w-full resize-none rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-sm break-all text-white focus:ring-2 focus:ring-purple-400 focus:outline-none"
      />
      <Button
        type="button"
        onClick={copy}
        aria-live="polite"
        className={cn(buttonClass, "bg-purple-600 text-white hover:bg-purple-500")}
      >
        {copied ? "Skopiowano" : "Kopiuj"}
      </Button>
      <form method="POST" action="/api/groups/invite" onSubmit={confirmRegenerate}>
        <input type="hidden" name="group_id" value={groupId} />
        <Button
          type="submit"
          className={cn(buttonClass, "border border-white/20 bg-white/10 text-white hover:bg-white/20")}
        >
          Wygeneruj nowy link
        </Button>
      </form>
    </div>
  );
}

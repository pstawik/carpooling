import { useEffect, useState } from "react";

/**
 * Tracks a native (non-React-action) form submission so the submit button can be
 * disabled while the browser navigates. Resets when the page is restored from the
 * back/forward cache, so "Back" never leaves the button stuck in its pending state.
 */
export function useSubmitting() {
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function reset(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", reset);
    return () => {
      window.removeEventListener("pageshow", reset);
    };
  }, []);

  return [submitting, setSubmitting] as const;
}

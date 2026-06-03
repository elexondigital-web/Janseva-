import { useEffect } from 'react';

/**
 * Phase 4 — set `document.title` to "JanSeva — <name>" while a page is
 * mounted, and reset to plain "JanSeva" on unmount. Pass undefined or
 * an empty string to disable while still mounting the hook.
 *
 * Safe to call from any page. The reset on unmount keeps tab labels
 * tidy when navigating to a route that doesn't set its own title.
 */
export function usePageTitle(name?: string | null) {
  useEffect(() => {
    const prev = document.title;
    if (name) {
      document.title = `JanSeva — ${name}`;
    }
    return () => {
      document.title = prev;
    };
  }, [name]);
}

import { createContext, useContext } from "react";

/**
 * Whether the page is rendering inside `AppShell`.
 *
 * WHY A PAGE NEEDS TO KNOW. Several screens carry a back arrow that predates
 * the shell: "Back to dashboard" on the routing and organisation admin pages,
 * the arrow in the careers and learning headers, "Back" on the privacy notice.
 * Inside the shell those are redundant — the bottom bar and the tab strip are
 * always on screen, so the arrow is a second, weaker way to do what the chrome
 * already does, pointing at one fixed destination instead of any of them.
 *
 * They cannot simply be deleted, because two of those pages render in BOTH
 * worlds. `/career-portal` and `/privacy` are public routes as well as tabs: an
 * applicant or a not-signed-in reader gets them bare, with no shell at all, and
 * for that reader the arrow is the only way back.
 *
 * So the arrow asks. Default `false`, which is the safe direction: a page
 * rendered somewhere unexpected keeps its own way out rather than losing it.
 */
export const InShellContext = createContext(false);

export function useInShell(): boolean {
  return useContext(InShellContext);
}

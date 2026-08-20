import { useEffect, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { searchRecipientDirectory, type RecipientMatch } from "../utils/recipientDirectory";

/**
 * Long enough that a fast typist does not fire a request per keystroke: each
 * search costs the server an identity check plus two directory queries.
 */
const DEBOUNCE_MS = 250;

/** Below this a query matches most of the directory; the server agrees. */
const MIN_QUERY_LENGTH = 2;

interface SearchResult {
  /** The query these matches answer, so a stale answer can be recognised. */
  query: string;
  matches: RecipientMatch[];
}

const NOTHING: RecipientMatch[] = [];

/**
 * Debounced tenant-directory search for the layer address pickers.
 *
 * Results are tagged with the query they answer and filtered on the way out
 * rather than cleared on the way in. That keeps the last answer from flashing
 * up against a query it does not belong to — backspacing from "ali" to "al"
 * shows nothing until "al" itself comes back, not Ali again.
 */
export function useRecipientSearch(query: string): RecipientMatch[] {
  const { instance, accounts } = useMsal();
  const [result, setResult] = useState<SearchResult>({ query: "", matches: NOTHING });
  const latestRequest = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    if (trimmed.length < MIN_QUERY_LENGTH) return;

    const requestId = ++latestRequest.current;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const account = accounts[0];
          if (!account) return;
          const { accessToken } = await instance.acquireTokenSilent({
            scopes: ["User.Read"],
            account,
          });
          const matches = await searchRecipientDirectory(accessToken, trimmed);
          // Answers can arrive out of order; only the newest may land.
          if (requestId === latestRequest.current) setResult({ query: trimmed, matches });
        } catch {
          // A directory that cannot be reached leaves the picker on its local
          // suggestions; typing the address by hand still works.
          if (requestId === latestRequest.current) setResult({ query: trimmed, matches: NOTHING });
        }
      })();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [trimmed, instance, accounts]);

  return result.query === trimmed ? result.matches : NOTHING;
}
